"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { canManageReferrals } from "@/lib/admin/roles";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { z } from "@/lib/zod";
import { getStaff } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { progressDeps, referralV2Rules } from "../referral/deps";
import { applyHold } from "../referral/holds";
import { previewRevokeWith, ReviewError, revokeReferralWith, validateReferralWith, type ReviewErrorCode } from "../referral/review-core";
import { getSetting } from "../settings";

// Parrainage v2 : toute l'équipe (ADMIN et DEV) traite la file « À vérifier », exception explicite au « seul l'admin
// écrit » (lib/admin/roles.ts, canManageReferrals, vérifiée par lib/admin/dev-access.test.ts). Ordre : équipe → Zod →
// rate limit, puis tout est relu sous verrou (server/referral/review-core.ts), qui écrit chaque décision dans le
// journal admin.

export type ReferralStaffError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | ReviewErrorCode;
type Fail = { ok: false; error: ReferralStaffError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const reviewSchema = z
  .object({ referralId: id, decision: z.enum(["VALIDATE", "REVOKE", "BAN"]), reason: z.string().trim().max(300).nullable() })
  .strict()
  .refine((v) => v.decision === "VALIDATE" || (v.reason !== null && v.reason.length > 0), { message: "Motif obligatoire" });
const referralSchema = z.object({ referralId: id }).strict();

/** Membre de l'équipe autorisé sur le parrainage, ou null. */
async function staff() {
  const s = await getStaff();
  return s && canManageReferrals(s.user.role) ? s.user : null;
}

const limited = async (userId: string, bucket: string, limit: number) => !(await rateLimit(`referral-${bucket}:${userId}`, { limit, windowSeconds: 60 })).success;

function failure(scope: string, e: unknown): Fail {
  if (e instanceof ReviewError) return { ok: false, error: e.code };
  console.error(`[parrainage admin] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

/**
 * Décision sur un parrainage : valider (tout ce qui était dû est versé), révoquer (plus rien n'est versé, rien n'est
 * repris), ou révoquer et bannir (tout est repris, les deux comptes sont bannis). Un motif est exigé pour révoquer.
 */
export async function reviewReferralAction(input: unknown): Promise<{ ok: true; paid: number; banned: number } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "review", 20)) return { ok: false, error: "RATE_LIMITED" };
  const { referralId, decision, reason } = parsed.data;
  const now = new Date();
  try {
    if (decision === "VALIDATE") {
      const { paid } = await validateReferralWith(prisma, { staffId: user.id, referralId, note: reason, now }, await progressDeps(now));
      refresh();
      return { ok: true, paid, banned: 0 };
    }
    const { banned } = await revokeReferralWith(prisma, {
      staffId: user.id,
      referralId,
      ban: decision === "BAN",
      reason: reason ?? "",
      now,
      sharedIpCap: await getSetting("multiAccount.sharedIpCap"),
    });
    refresh();
    return { ok: true, paid: 0, banned: banned.length };
  } catch (e) {
    return failure("décision", e);
  }
}

/** Recalcule le score de la paire ; au-dessus du seuil, le parrainage passe « À vérifier » s'il n'est pas tranché. */
export async function rescoreReferralAction(input: unknown): Promise<{ ok: true; held: boolean } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = referralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "rescore", 30)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const referral = await prisma.referral.findUnique({ where: { id: parsed.data.referralId }, select: { id: true, version: true, referrerId: true, refereeId: true } });
    if (!referral || referral.version !== 2) return { ok: false, error: "NOT_FOUND" };
    const [rules, sharedCap] = await Promise.all([referralV2Rules(), getSetting("multiAccount.sharedIpCap")]);
    const held = await prisma.$transaction((tx) => applyHold(tx, referral, rules, { withScore: true, sharedCap, now: new Date() }));
    refresh();
    return { ok: true, held: held !== null };
  } catch (e) {
    return failure("score", e);
  }
}

export type RevokePreviewLine = {
  user: string;
  what: "ZENI" | "BOOSTERS" | "SEALED" | "CARDS" | "VOUCHERS";
  /** Nom du booster (BOOSTERS). */
  name: string | null;
  given: number;
  taken: number;
};

/**
 * Aperçu de « Révoquer et bannir », pour la confirmation : ce que chaque joueur a reçu du parrainage, ce qui serait
 * repris, et les paliers du parrain qui tomberaient. Rien n'est écrit ; la reprise relit tout sous verrou.
 */
export async function revokePreviewAction(input: unknown): Promise<{ ok: true; lines: RevokePreviewLine[]; milestones: number[]; referrer: string } | Fail> {
  const user = await staff();
  if (!user) return { ok: false, error: "FORBIDDEN" };
  const parsed = referralSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(user.id, "preview", 60)) return { ok: false, error: "RATE_LIMITED" };
  try {
    const preview = await previewRevokeWith(prisma, parsed.data.referralId);
    if (!preview) return { ok: false, error: "NOT_FOUND" };
    const typeIds = [...new Set(preview.reports.flatMap((r) => Object.keys(r.granted.credits)))];
    const [locale, players, types] = await Promise.all([
      getLocale(),
      prisma.user.findMany({ where: { id: { in: [preview.referrerId, ...preview.reports.map((r) => r.userId)] } }, select: { id: true, username: true } }),
      prisma.boosterType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }),
    ]);
    const nameOf = new Map(players.map((p) => [p.id, p.username]));
    const typeName = new Map(types.map((b) => [b.id, localize(parseLocalized(b.name), locale)]));
    const lines: RevokePreviewLine[] = [];
    for (const r of preview.reports) {
      const who = nameOf.get(r.userId) ?? r.userId;
      const { granted, taken } = r;
      if (granted.zeni > 0) lines.push({ user: who, what: "ZENI", name: null, given: granted.zeni, taken: taken.zeni });
      for (const [type, n] of Object.entries(granted.credits)) {
        if (n > 0) lines.push({ user: who, what: "BOOSTERS", name: typeName.get(type) ?? type, given: n, taken: taken.credits[type] ?? 0 });
      }
      if (granted.sealedIds.length) lines.push({ user: who, what: "SEALED", name: null, given: granted.sealedIds.length, taken: taken.sealedIds.length });
      if (granted.cardIds.length) lines.push({ user: who, what: "CARDS", name: null, given: granted.cardIds.length, taken: taken.cardIds.length });
      if (granted.voucherIds.length) lines.push({ user: who, what: "VOUCHERS", name: null, given: granted.voucherIds.length, taken: taken.voucherIds.length });
    }
    return { ok: true, lines, milestones: preview.milestones, referrer: nameOf.get(preview.referrerId) ?? "" };
  } catch (e) {
    return failure("aperçu", e);
  }
}
