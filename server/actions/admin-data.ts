"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { confirmsUsername } from "@/lib/account/deletion";
import { AccountError, anonymizeUserWith, cancelDeletionWith } from "../account/account-core";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";

// Données personnelles depuis /admin (demandes de suppression, anonymisation RGPD).
// Ordre : rôle admin → Zod → rate limit. L'AdminLog est écrit dans la transaction de account-core.

export type AdminDataError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "CONFIRM_MISMATCH" | "SELF" | "NOT_REQUESTED" | "ANONYMIZED";
export type AdminDataResult = { ok: true } | { ok: false; error: AdminDataError };

const userIdSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const anonymizeSchema = z.object({ userId: userIdSchema, confirm: z.string().max(40) });
const cancelSchema = z.object({ userId: userIdSchema });

const limited = async (adminId: string) => !(await rateLimit(`admin:${adminId}`, { limit: 20, windowSeconds: 60 })).success;

/** Anonymise tout de suite (demande du joueur ou décision RGPD), confirmé par le pseudo exact. */
export async function adminAnonymizeAction(input: unknown): Promise<AdminDataResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = anonymizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  if (parsed.data.userId === admin.id) return { ok: false, error: "SELF" };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { username: true, anonymizedAt: true } });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  if (target.anonymizedAt) return { ok: false, error: "ANONYMIZED" };
  if (!confirmsUsername(parsed.data.confirm, target.username)) return { ok: false, error: "CONFIRM_MISMATCH" };

  await anonymizeUserWith(prisma, { userId: parsed.data.userId, now: new Date(), adminId: admin.id });
  refresh();
  return { ok: true };
}

/** Annule une demande de suppression en attente (à la demande du joueur, par exemple). */
export async function adminCancelDeletionAction(input: unknown): Promise<AdminDataResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  try {
    await cancelDeletionWith(prisma, { userId: parsed.data.userId, now: new Date(), adminId: admin.id });
  } catch (e) {
    if (e instanceof AccountError) {
      return { ok: false, error: e.code === "NO_USER" ? "NOT_FOUND" : e.code === "ANONYMIZED" ? "ANONYMIZED" : "NOT_REQUESTED" };
    }
    throw e;
  }
  refresh();
  return { ok: true };
}
