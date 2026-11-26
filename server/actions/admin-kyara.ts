"use server";

import { refresh, updateTag } from "next/cache";
import { canProcessKyaraImports } from "@/lib/admin/roles";
import { KYARA_REJECT_CODES, type KyaraReviewReason } from "@/lib/kyara/codes";
import { KYARA_PAYLOAD_LIMITS, type KyaraDecodeError } from "@/lib/kyara/payload";
import { z } from "@/lib/zod";
import { getStaff } from "../admin";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { prisma } from "../db";
import {
  applyImportWith,
  issueStaffKeyWith,
  KyaraImportError,
  receivePayloadWith,
  rejectImportWith,
  remindImportWith,
  reopenImportWith,
  rereadImportWith,
  type KyaraErrorCode,
} from "../kyara/import-core";
import { decodeFragment } from "../kyara/payload";
import { getKyaraGuards, getKyaraRules } from "../kyara/queries";
import { pushLater } from "../market/queries";
import { rateLimit } from "../ratelimit";

// File de l'import Kyara : toute l'équipe (ADMIN et DEV) la traite, exception explicite au « seul l'admin écrit »
// (lib/admin/roles.ts, vérifiée par lib/admin/dev-access.test.ts). Ordre : équipe → Zod → rate limit, puis tout est
// relu sous verrou (server/kyara/import-core.ts). Chaque décision est écrite dans le journal admin.
// Chaque membre a son favori, avec sa clé : un lot n'est accepté que s'il vient du favori du membre connecté.

export type KyaraStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | KyaraDecodeError | KyaraErrorCode;
type Fail = { ok: false; error: KyaraStaffError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const importSchema = z.object({ importId: id }).strict();
const receiveSchema = z
  .object({ fragment: z.string().min(1).max(KYARA_PAYLOAD_LIMITS.fragmentChars + 1), importId: id.nullable(), confirmWithoutDiscord: z.boolean() })
  .strict();
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

/**
 * Clé du favori de ce membre, montrée une seule fois (seule son empreinte est gardée) ; la page en fait le favori.
 * En générer une nouvelle désactive l'ancien favori.
 */
export async function issueKyaraStaffKeyAction(): Promise<{ ok: true; key: string } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  if (await limited(user.id, "key", 5)) return { ok: false, error: "RATE_LIMITED" };
  try {
    return { ok: true, key: await issueStaffKeyWith(prisma, { staffId: user.id, now: new Date() }) };
  } catch (e) {
    return failure("clé du favori", e);
  }
}

export type KyaraReceiveOk =
  | { ok: true; status: "DONE"; importId: string; player: string | null; cards: number; zeni: number }
  | { ok: true; status: "READY"; importId: string; player: string | null; reason: KyaraReviewReason };
/** Profil lu, rendu avec un refus pour aider l'équipe (pseudo Kyara à comparer, demande à choisir à la main). */
export type KyaraReceiveFail = Fail & { profile?: { pseudo: string | null; kyaraUserId: string } };

/**
 * Lot du favori (fragment d'URL de la page de réception) : décodé, borné, puis vérifié sous verrou. Lecture sûre :
 * versée tout de suite ; lecture douteuse : gardée « à vérifier ». `importId` : demande choisie par l'équipe quand
 * l'avatar Kyara ne montre pas d'ID Discord (avec `confirmWithoutDiscord`).
 */
export async function receiveKyaraPayloadAction(input: unknown): Promise<KyaraReceiveOk | KyaraReceiveFail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "receive", 30)) return { ok: false, error: "RATE_LIMITED" };
  const decoded = decodeFragment(parsed.data.fragment);
  if (!decoded.ok) return { ok: false, error: decoded.error };
  const profile = { pseudo: decoded.payload.pseudo, kyaraUserId: decoded.payload.kyaraUserId };
  try {
    const [rules, guards] = await Promise.all([getKyaraRules(), getKyaraGuards()]);
    const res = await receivePayloadWith(
      prisma,
      {
        staffId: user.id,
        payload: decoded.payload,
        importId: parsed.data.importId,
        confirmWithoutDiscord: parsed.data.confirmWithoutDiscord,
        staffKyaraUserId: rules.staffKyaraUserId,
        autoCaps: guards.autoCaps,
        staffKeyDays: guards.staffKeyDays,
        now: new Date(),
      },
      pushLater,
    );
    const player = (await prisma.user.findUnique({ where: { id: res.userId }, select: { username: true } }))?.username ?? null;
    // Les cartes versées comptent au classement des collectionneurs
    if (res.status === "DONE") updateTag(LEADERBOARD_TAG);
    refresh();
    return res.status === "DONE"
      ? { ok: true, status: "DONE", importId: res.importId, player, cards: res.cards, zeni: res.zeni }
      : { ok: true, status: "READY", importId: res.importId, player, reason: res.reason };
  } catch (e) {
    return { ...failure("réception", e), profile };
  }
}

/**
 * Versement d'une lecture « à vérifier », avec les totaux de l'aperçu validé : refusé (STALE) s'ils ont changé, et
 * refusé au membre qui a reçu un gros lot (SECOND_STAFF_REQUIRED).
 */
export async function applyKyaraImportAction(input: unknown): Promise<{ ok: true; cards: number; zeni: number } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "apply", 10)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const { autoCaps } = await getKyaraGuards();
    const res = await applyImportWith(prisma, { staffId: user.id, ...parsed.data, autoCaps, now: new Date() }, pushLater);
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

/**
 * Relance du joueur d'une demande en attente : notification avec le rappel de la marche à suivre sur Kyara, pas plus
 * d'une fois par délai kyaraImport.reminderCooldownHours.
 */
export async function remindKyaraImportAction(input: unknown): Promise<{ ok: true } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "remind", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const { reminderCooldownHours } = await getKyaraGuards();
    await remindImportWith(prisma, { staffId: user.id, importId: parsed.data.importId, cooldownHours: reminderCooldownHours, now: new Date() }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("relance", e);
  }
}

/** Refus annulé : la demande repart en attente, le joueur est prévenu. */
export async function reopenKyaraImportAction(input: unknown): Promise<{ ok: true } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "reopen", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await reopenImportWith(prisma, { staffId: user.id, importId: parsed.data.importId, now: new Date() }, pushLater);
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
