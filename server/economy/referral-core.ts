// Parrainage : rattachement, qualification et réclamation, atomiques. Client Prisma injecté.
// Rien n'est versé au rattachement : seulement quand le filleul est qualifié (compte inscrit et
// vérifié, assez ancien, assez actif), et chacun réclame son lot une seule fois.
import type { PrismaClient } from "@/generated/prisma/client";
import {
  checkAttach,
  isQualified,
  REFERRAL_WINDOW_MS,
  type AttachRefusal,
  type RefereeProgress,
  type ReferralMilestone,
  type ReferralRules,
} from "@/lib/economy/referral";
import { blocksBetween, lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { grantLot, type LotDeps, type LotGrant } from "./lots";

export type ReferralErrorCode =
  | AttachRefusal
  | "NO_USER"
  | "BANNED"
  | "NOT_FOUND"
  | "NOT_QUALIFIED"
  | "ALREADY_CLAIMED"
  | "NO_REWARD";

export class ReferralError extends Error {
  constructor(readonly code: ReferralErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };

/**
 * Rattache le filleul `refereeId` au parrain du code `code` (déjà normalisé). Les deux joueurs
 * sont verrouillés : deux rattachements simultanés d'un même filleul n'en gardent qu'un, et le
 * plafond mensuel du parrain est compté sous verrou.
 */
export async function attachReferralWith(
  db: PrismaClient,
  input: { refereeId: string; code: string; now: Date; rules: ReferralRules },
): Promise<{ referralId: string }> {
  if (!input.rules.enabled) throw new ReferralError("DISABLED");
  const owner = await db.user.findUnique({ where: { referralCode: input.code }, select: { id: true } });
  if (!owner) throw new ReferralError("INVALID_CODE");

  return db.$transaction(async (tx) => {
    const players = await lockPlayers(tx, [input.refereeId, owner.id]);
    const referee = players.get(input.refereeId);
    const referrer = players.get(owner.id);
    if (!referee) throw new ReferralError("NO_USER");
    if (!referrer) throw new ReferralError("INVALID_CODE");

    const [existing, reverse, blocks, recent] = await Promise.all([
      tx.referral.findUnique({ where: { refereeId: referee.id }, select: { id: true } }),
      tx.referral.findFirst({ where: { referrerId: referee.id, refereeId: referrer.id }, select: { id: true } }),
      referee.id === referrer.id ? Promise.resolve({ byMe: false, byThem: false }) : blocksBetween(tx, referee.id, referrer.id),
      tx.referral.count({
        where: { referrerId: referrer.id, createdAt: { gt: new Date(input.now.getTime() - REFERRAL_WINDOW_MS) } },
      }),
    ]);

    const refusal = checkAttach({
      referee,
      referrer,
      alreadyReferred: existing !== null,
      reverse: reverse !== null,
      blocked: blocks.byMe || blocks.byThem,
      referrerRecent: recent,
      now: input.now,
      rules: input.rules,
    });
    if (refusal) throw new ReferralError(refusal);

    const referral = await tx.referral.create({
      data: { referrerId: referrer.id, refereeId: referee.id, createdAt: input.now },
      select: { id: true },
    });
    await tx.user.update({ where: { id: referee.id }, data: { referredById: referrer.id } });
    return { referralId: referral.id };
  }, TX);
}

/** Où en est un filleul (lu hors verrou pour l'affichage, sous verrou pour qualifier). */
export async function refereeProgress(db: Tx, refereeId: string, since: Date): Promise<RefereeProgress | null> {
  const user = await db.user.findUnique({
    where: { id: refereeId },
    select: { isGuest: true, bannedAt: true, createdAt: true, emailVerified: true, discordLinkedAt: true },
  });
  if (!user) return null;
  // Boosters ouverts depuis le rattachement : l'activité d'avant (compte invité) ne compte pas
  const boostersOpened = await db.boosterOpening.count({ where: { userId: refereeId, createdAt: { gte: since } } });
  return {
    isGuest: user.isGuest,
    bannedAt: user.bannedAt,
    createdAt: user.createdAt,
    verified: user.emailVerified !== null || user.discordLinkedAt !== null,
    boostersOpened,
  };
}

/**
 * Qualifie les parrainages en attente où `userId` est parrain ou filleul, si le filleul remplit
 * les conditions. Paresseux (visite de /parrainage, ouverture de booster) et idempotent : le
 * passage PENDING → QUALIFIED est conditionnel, la notification part une seule fois.
 */
export async function qualifyReferralsWith(
  db: PrismaClient,
  userId: string,
  rules: ReferralRules,
  now: Date,
  onNotified?: OnNotified,
): Promise<number> {
  if (!rules.enabled) return 0;
  const pending = await db.referral.findMany({
    where: { status: "PENDING", OR: [{ referrerId: userId }, { refereeId: userId }] },
    select: { id: true, referrerId: true, refereeId: true, createdAt: true },
    take: 50,
  });
  let qualified = 0;
  for (const r of pending) {
    const progress = await refereeProgress(db, r.refereeId, r.createdAt);
    if (!progress || !isQualified(progress, rules, now)) continue;
    const done = await notifyingTransaction(db, async (tx) => {
      const moved = await tx.referral.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "QUALIFIED", qualifiedAt: now },
      });
      if (moved.count !== 1) return false;
      await notify(tx, { userId: r.referrerId, type: "REFERRAL_QUALIFIED", actorId: r.refereeId, refId: r.id, now });
      return true;
    }, TX, onNotified);
    if (done) qualified++;
  }
  return qualified;
}

export type ReferralSide = "referrer" | "referee";

/** Réclame sa récompense d'un parrainage qualifié, une seule fois par côté. */
export async function claimReferralWith(
  db: PrismaClient,
  input: { userId: string; referralId: string; lotId: string | null; now: Date },
  deps: LotDeps,
): Promise<{ grant: LotGrant; side: ReferralSide }> {
  return db.$transaction(async (tx) => {
    const player = (await lockPlayers(tx, [input.userId])).get(input.userId);
    if (!player) throw new ReferralError("NO_USER");
    if (player.bannedAt) throw new ReferralError("BANNED");

    const referral = await tx.referral.findUnique({
      where: { id: input.referralId },
      select: { referrerId: true, refereeId: true, status: true },
    });
    // Propriété : seul l'un des deux joueurs du parrainage peut réclamer, et seulement son côté
    const side: ReferralSide | null =
      referral?.referrerId === input.userId ? "referrer" : referral?.refereeId === input.userId ? "referee" : null;
    if (!referral || !side) throw new ReferralError("NOT_FOUND");
    if (referral.status !== "QUALIFIED") throw new ReferralError("NOT_QUALIFIED");
    if (!input.lotId) throw new ReferralError("NO_REWARD");

    const claimedField = side === "referrer" ? "referrerClaimedAt" : "refereeClaimedAt";
    const claimed = await tx.referral.updateMany({
      where: { id: input.referralId, status: "QUALIFIED", [claimedField]: null },
      data: { [claimedField]: input.now },
    });
    if (claimed.count !== 1) throw new ReferralError("ALREADY_CLAIMED");

    const grant = await grantLot(tx, input.userId, input.lotId, { reason: "REFERRAL", refId: input.referralId }, deps, input.now);
    return { grant, side };
  }, TX);
}

/**
 * Réclame un palier de parrainage, une seule fois par seuil. Les filleuls qualifiés (révoqués
 * exclus) sont comptés sous le verrou du parrain : deux réclamations simultanées n'en versent qu'une.
 */
export async function claimReferralMilestoneWith(
  db: PrismaClient,
  input: { userId: string; milestone: ReferralMilestone; now: Date },
  deps: LotDeps,
): Promise<LotGrant> {
  return db.$transaction(async (tx) => {
    const player = (await lockPlayers(tx, [input.userId])).get(input.userId);
    if (!player) throw new ReferralError("NO_USER");
    if (player.bannedAt) throw new ReferralError("BANNED");

    const { referrals, lotId } = input.milestone;
    const qualified = await tx.referral.count({ where: { referrerId: input.userId, status: "QUALIFIED" } });
    if (qualified < referrals) throw new ReferralError("NOT_QUALIFIED");

    const already = await tx.referralMilestoneClaim.findUnique({
      where: { userId_referrals: { userId: input.userId, referrals } },
      select: { id: true },
    });
    if (already) throw new ReferralError("ALREADY_CLAIMED");

    const claim = await tx.referralMilestoneClaim.create({
      data: { userId: input.userId, referrals, lotId, claimedAt: input.now },
      select: { id: true },
    });
    return grantLot(tx, input.userId, lotId, { reason: "REFERRAL", refId: claim.id }, deps, input.now);
  }, TX);
}
