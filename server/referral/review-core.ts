import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isStaff } from "@/lib/admin/roles";
import { ORDINARY_COPY } from "@/lib/collection/copies";
import { planClawback, sumGrants, type ClawbackPlan, type RewardGrant } from "@/lib/referral/clawback";
import { writeAdminLog } from "../admin/log";
import { banGroupInTx } from "../anticheat/network-ban-core";
import { withdrawCasinoFor } from "../casino/coinflip-core";
import { consumeBoostersUpTo } from "../economy/credits";
import { debit } from "../economy/ledger";
import { lockPlayers } from "../social/lock";
import { installedCount, payDueRewardsWith, type PayoutDeps } from "./payout-core";

// Décisions de l'équipe sur un parrainage v2 (ADMIN ou DEV, vérifié par l'action) :
//   - Valider : le blocage est levé, tout ce qui était dû est versé (payDueRewardsWith).
//   - Révoquer : le parrainage ne compte plus et ne verse plus rien ; rien n'est repris.
//   - Révoquer et bannir, en une seule transaction : tout ce que le parrainage a versé est repris (Zeni dans la limite
//     du solde, crédits non ouverts, sachets encore scellés, exemplaires encore possédés, ordinaires et jamais mis aux
//     enchères, bons inutilisés), ainsi que les paliers du parrain au-dessus de son nouveau compte ; les deux comptes
//     sont bannis (bans réseau, sauf un compte de l'équipe) ; le journal de l'équipe compare le versé et le repris.
// Le parrainage est verrouillé en premier, puis les joueurs, comme pour un versement : une reprise et un versement
// lancés en même temps passent l'un après l'autre.

export type ReviewErrorCode = "NOT_FOUND" | "NOT_V2" | "NOT_HELD" | "ALREADY_REVIEWED" | "ALREADY_REVOKED";

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 60_000 };

type LockedReferral = { id: string; version: number; referrerId: string; refereeId: string; heldAt: Date | null; reviewedAt: Date | null; revokedAt: Date | null };

async function lockReferral(tx: Prisma.TransactionClient, referralId: string): Promise<LockedReferral> {
  const [row] = await tx.$queryRaw<LockedReferral[]>`
    SELECT id, version, "referrerId", "refereeId", "heldAt", "reviewedAt", "revokedAt" FROM "Referral" WHERE id = ${referralId} FOR UPDATE`;
  if (!row) throw new ReviewError("NOT_FOUND");
  if (row.version !== 2) throw new ReviewError("NOT_V2");
  if (row.revokedAt) throw new ReviewError("ALREADY_REVOKED");
  return row;
}

/** Valide un parrainage « À vérifier », puis verse tout ce qui était dû. */
export async function validateReferralWith(
  db: PrismaClient,
  input: { staffId: string; referralId: string; note: string | null; now: Date },
  deps: PayoutDeps,
): Promise<{ paid: number }> {
  await db.$transaction(async (tx) => {
    const r = await lockReferral(tx, input.referralId);
    if (!r.heldAt) throw new ReviewError("NOT_HELD");
    if (r.reviewedAt) throw new ReviewError("ALREADY_REVIEWED");
    await tx.referral.update({ where: { id: r.id }, data: { reviewedAt: input.now, reviewedById: input.staffId, reviewDecision: "VALIDATED" }, select: { id: true } });
    await writeAdminLog(tx, { adminId: input.staffId, action: "REFERRAL_VALIDATE", targetType: "Referral", targetId: r.id, after: { note: input.note } });
  }, TX);
  return { paid: await payDueRewardsWith(db, input.referralId, { ...deps, now: input.now }) };
}

export type ClawbackReport = { userId: string; granted: RewardGrant; taken: ClawbackPlan };
export type RevokeOutcome = { banned: string[]; reports: ClawbackReport[] };

/** Ce que le joueur a encore, parmi ce que ces versements lui ont donné. */
async function holdingsOf(tx: Prisma.TransactionClient, userId: string, coins: number, granted: RewardGrant) {
  const [credits, sealed, cards, vouchers] = await Promise.all([
    tx.boosterCredit.findMany({ where: { userId, boosterTypeId: { in: Object.keys(granted.credits) } }, select: { boosterTypeId: true, count: true } }),
    tx.sealedDrop.findMany({ where: { id: { in: [...granted.sealedIds] }, ownerId: userId, openedAt: null }, select: { id: true } }),
    tx.userCard.findMany({
      where: { id: { in: [...granted.cardIds] }, ownerId: userId, status: "COLLECTION", ...ORDINARY_COPY, auctions: { none: {} } },
      select: { id: true },
    }),
    tx.voucher.findMany({ where: { id: { in: [...granted.voucherIds] }, userId, usedAt: null }, select: { id: true } }),
  ]);
  return {
    coins,
    credits: Object.fromEntries(credits.map((c) => [c.boosterTypeId, c.count])),
    sealedIds: new Set(sealed.map((s) => s.id)),
    cardIds: new Set(cards.map((c) => c.id)),
    voucherIds: new Set(vouchers.map((v) => v.id)),
  };
}

/** Lit le contenu d'un versement (ReferralReward.granted), à défaut vide. */
function grantOf(raw: Prisma.JsonValue): RewardGrant {
  const g = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const credits = g.credits && typeof g.credits === "object" && !Array.isArray(g.credits) ? (g.credits as Record<string, unknown>) : {};
  return {
    zeni: Number.isSafeInteger(g.zeni) ? (g.zeni as number) : 0,
    credits: Object.fromEntries(Object.entries(credits).filter(([, n]) => Number.isSafeInteger(n)).map(([k, n]) => [k, n as number])),
    sealedIds: ids(g.sealedIds),
    cardIds: ids(g.cardIds),
    voucherIds: ids(g.voucherIds),
  };
}

export async function revokeReferralWith(
  db: PrismaClient,
  input: { staffId: string; referralId: string; ban: boolean; reason: string; now: Date; sharedIpCap: number },
): Promise<RevokeOutcome> {
  const outcome = await db.$transaction(async (tx): Promise<RevokeOutcome> => {
    const r = await lockReferral(tx, input.referralId);
    // Révoqué d'abord : le nouveau compte d'amis installés du parrain ne le compte plus
    await tx.referral.update({
      where: { id: r.id },
      data: { reviewedAt: input.now, reviewedById: input.staffId, reviewDecision: input.ban ? "BANNED" : "REVOKED", revokedAt: input.now },
      select: { id: true },
    });
    if (!input.ban) {
      await writeAdminLog(tx, { adminId: input.staffId, action: "REFERRAL_REVOKE", targetType: "Referral", targetId: r.id, after: { ban: false, reason: input.reason } });
      return { banned: [], reports: [] };
    }

    // Versements à reprendre : tous ceux du parrainage, et les paliers du parrain au-dessus de son nouveau compte
    const installed = await installedCount(tx, r.referrerId);
    const rewards = await tx.referralReward.findMany({
      where: {
        clawedBackAt: null,
        OR: [{ referralId: r.id }, { userId: r.referrerId, kind: "MILESTONE", milestone: { gt: installed } }],
      },
      select: { id: true, userId: true, granted: true },
    });
    const byUser = new Map<string, RewardGrant[]>();
    for (const w of rewards) byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), grantOf(w.granted)]);
    const players = await lockPlayers(tx, [r.referrerId, r.refereeId, ...byUser.keys()]);

    const reports: ClawbackReport[] = [];
    for (const [userId, grants] of byUser) {
      const player = players.get(userId);
      if (!player) continue;
      const granted = sumGrants(grants);
      const plan = planClawback(grants, await holdingsOf(tx, userId, player.coins, granted));
      if (plan.zeni > 0) await debit(tx, { userId, amount: plan.zeni, reason: "REFERRAL_CLAWBACK", refId: r.id, now: input.now });
      for (const [type, n] of Object.entries(plan.credits)) await consumeBoostersUpTo(tx, userId, type, n);
      if (plan.sealedIds.length) await tx.sealedDrop.deleteMany({ where: { id: { in: plan.sealedIds }, ownerId: userId, openedAt: null } });
      if (plan.cardIds.length) await tx.userCard.deleteMany({ where: { id: { in: plan.cardIds }, ownerId: userId, status: "COLLECTION" } });
      if (plan.voucherIds.length) await tx.voucher.deleteMany({ where: { id: { in: plan.voucherIds }, userId, usedAt: null } });
      reports.push({ userId, granted, taken: plan });
    }
    if (rewards.length) await tx.referralReward.updateMany({ where: { id: { in: rewards.map((w) => w.id) }, clawedBackAt: null }, data: { clawedBackAt: input.now } });

    // Les deux comptes bannis, sauf un compte de l'équipe (jamais banni par cette file)
    const accounts = await tx.user.findMany({ where: { id: { in: [r.referrerId, r.refereeId] } }, select: { id: true, role: true } });
    const targets = accounts.filter((a) => !isStaff(a.role) && a.id !== input.staffId).map((a) => a.id);
    const { banned } = targets.length
      ? await banGroupInTx(tx, { adminId: input.staffId, userIds: targets, reason: input.reason, now: input.now, sharedIpCap: input.sharedIpCap })
      : { banned: [] as string[] };
    await writeAdminLog(tx, {
      adminId: input.staffId,
      action: "REFERRAL_REVOKE",
      targetType: "Referral",
      targetId: r.id,
      after: { ban: true, reason: input.reason, banned, skippedStaff: accounts.filter((a) => !targets.includes(a.id)).map((a) => a.id), reports } as unknown as Prisma.InputJsonValue,
    });
    return { banned, reports };
  }, TX);
  for (const id of outcome.banned) await withdrawCasinoFor(db, id, input.now);
  return outcome;
}
