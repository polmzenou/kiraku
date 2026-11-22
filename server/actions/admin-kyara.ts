"use server";

import { refresh, updateTag } from "next/cache";
import { canProcessKyaraImports } from "@/lib/admin/roles";
import { KYARA_REJECT_CODES } from "@/lib/kyara/codes";
import { KYARA_PAYLOAD_LIMITS, type KyaraDecodeError } from "@/lib/kyara/payload";
import { z } from "@/lib/zod";
import { getStaff } from "../admin";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { prisma } from "../db";
import {
  applyImportWith,
  KyaraImportError,
  prepareProcessingWith,
  receivePayloadWith,
  rejectImportWith,
  reopenImportWith,
  rereadImportWith,
  type KyaraErrorCode,
} from "../kyara/import-core";
import { decodeFragment } from "../kyara/payload";
import { getKyaraRules } from "../kyara/queries";
import { pushLater } from "../market/queries";
import { rateLimit } from "../ratelimit";

// File de l'import Kyara : toute l'équipe (ADMIN et DEV) la traite, exception explicite au « seul l'admin écrit »
// (lib/admin/roles.ts, vérifiée par lib/admin/dev-access.test.ts). Ordre : équipe → Zod → rate limit, puis tout est
// relu sous verrou (server/kyara/import-core.ts). Chaque décision est écrite dans le journal admin.

export type KyaraStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | KyaraDecodeError | KyaraErrorCode;
type Fail = { ok: false; error: KyaraStaffError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const importSchema = z.object({ importId: id }).strict();
const receiveSchema = z.object({ fragment: z.string().min(1).max(KYARA_PAYLOAD_LIMITS.fragmentChars + 1), confirmWithoutDiscord: z.boolean() }).strict();
const applySchema = z
  .object({ importId: id, expectedCards: z.number().int().min(0).max(100_000), expectedZeni: z.number().int().min(0).max(100_000_000) })
  .strict();
const rejectSchema = z
  .object({ importId: id, code: z.enum(KYARA_REJECT_CODES), note: z.string().trim().max(300).nullable() })
  .strict()
  .refine((v) => v.code !== "OTHER" || (v.note !== null && v.note.length > 0), { message: "Motif libre obligatoire" });

/** Membre de l'équipe autorisé à traiter la file, ou null. */
async function staff() {
  const s = await getStaff();
  return s && canProcessKyaraImports(s.user.role) ? s.user : null;
}

function failure(scope: string, e: unknown): Fail {
  if (e instanceof KyaraImportError) return { ok: false, error: e.code };
  console.error(`[kyara admin] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

const limited = async (userId: string, bucket: string, limit: number) => !(await rateLimit(`kyara-${bucket}:${userId}`, { limit, windowSeconds: 60 })).success;

/** Lien de traitement : le profil Kyara du joueur avec un code à usage unique, propre à ce membre de l'équipe. */
export async function prepareKyaraProcessingAction(input: unknown): Promise<{ ok: true; url: string; expiresAt: string } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "prepare", 60)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const rules = await getKyaraRules();
    const res = await prepareProcessingWith(prisma, { staffId: user.id, importId: parsed.data.importId, nonceMinutes: rules.nonceMinutes, now: new Date() });
    return { ok: true, url: res.url, expiresAt: res.expiresAt.toISOString() };
  } catch (e) {
    return failure("préparation", e);
  }
}

/** Lot du favori (fragment d'URL de la page de réception) : décodé, borné, puis vérifié sous verrou. */
export async function receiveKyaraPayloadAction(input: unknown): Promise<{ ok: true; importId: string; discordVerified: boolean } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "receive", 20)) return { ok: false, error: "RATE_LIMITED" };
  const decoded = decodeFragment(parsed.data.fragment);
  if (!decoded.ok) return { ok: false, error: decoded.error };
  try {
    const res = await receivePayloadWith(prisma, {
      staffId: user.id,
      payload: decoded.payload,
      confirmWithoutDiscord: parsed.data.confirmWithoutDiscord,
      now: new Date(),
    });
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return failure("réception", e);
  }
}

/** Versement, avec les totaux de l'aperçu validé : refusé (STALE) si la collection du joueur a changé depuis. */
export async function applyKyaraImportAction(input: unknown): Promise<{ ok: true; cards: number; zeni: number } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "apply", 10)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const res = await applyImportWith(prisma, { staffId: user.id, ...parsed.data, now: new Date() }, pushLater);
    // Les cartes versées comptent au classement des collectionneurs
    updateTag(LEADERBOARD_TAG);
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return failure("versement", e);
  }
}

export async function rejectKyaraImportAction(input: unknown): Promise<{ ok: true } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "reject", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const note = parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null;
    await rejectImportWith(prisma, { staffId: user.id, importId: parsed.data.importId, code: parsed.data.code, note, now: new Date() }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("refus", e);
  }
}

export async function reopenKyaraImportAction(input: unknown): Promise<{ ok: true } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "reopen", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await reopenImportWith(prisma, { staffId: user.id, importId: parsed.data.importId, now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("réouverture", e);
  }
}

export async function rereadKyaraImportAction(input: unknown): Promise<{ ok: true } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "reread", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await rereadImportWith(prisma, { staffId: user.id, importId: parsed.data.importId, now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("relecture", e);
  }
}
