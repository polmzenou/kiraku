"use server";

import { refresh } from "next/cache";
import { isStaff } from "@/lib/admin/roles";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { cancelImportWith, KyaraImportError, requestImportWith, type KyaraErrorCode } from "../kyara/import-core";
import { getKyaraRules } from "../kyara/queries";
import { clientIp, rateLimit } from "../ratelimit";
import { requireActiveUser } from "../user";

// Import Kyara, côté joueur. Ordre des contrôles : session → Zod → rate limit, puis tout est relu sous le verrou
// du joueur (server/kyara/import-core.ts) : fenêtre, Discord lié, une seule demande par compte et par Discord.
// La demande ne porte rien d'autre : l'équipe lit le profil Kyara de l'ami, retrouvé par son Discord. Le client
// n'envoie que l'id de sa demande pour l'annuler.

export type KyaraImportActionError = "NO_SESSION" | "INVALID" | "RATE_LIMITED" | KyaraErrorCode;
type Result = { ok: true } | { ok: false; error: KyaraImportActionError };

const cancelSchema = z.object({ importId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

function failure(scope: string, e: unknown): Result {
  if (e instanceof KyaraImportError) return { ok: false, error: e.code };
  console.error(`[kyara] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

export async function requestKyaraImportAction(): Promise<Result> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  // Par joueur, et par adresse pour freiner les comptes en série
  const [mine, network] = await Promise.all([
    rateLimit(`kyara-request:${user.id}`, { limit: 5, windowSeconds: 3_600 }),
    rateLimit(`kyara-request-ip:${await clientIp()}`, { limit: 10, windowSeconds: 86_400 }),
  ]);
  if (!mine.success || !network.success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await requestImportWith(prisma, {
      userId: user.id,
      rules: await getKyaraRules(),
      staff: isStaff(user.role),
      now: new Date(),
    });
  } catch (e) {
    return failure("demande", e);
  }
  refresh();
  return { ok: true };
}

export async function cancelKyaraImportAction(input: unknown): Promise<Result> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`kyara-cancel:${user.id}`, { limit: 10, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await cancelImportWith(prisma, { userId: user.id, importId: parsed.data.importId, now: new Date() });
  } catch (e) {
    return failure("annulation", e);
  }
  refresh();
  return { ok: true };
}
