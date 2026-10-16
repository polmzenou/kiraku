// Lots envoyés depuis /admin/lots : à un joueur, ou à tous par paquets (reprenable). Chaque versement
// est sa propre transaction (grantLot + LotGrant + notification + journal des Zeni) ; la contrainte
// unique (broadcastId, userId) garantit qu'un envoi à tous ne verse jamais deux fois au même joueur,
// même relancé en parallèle. Client injecté : pas de server/db.ts ici.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { writeAdminLog } from "../admin/log";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { grantLot, LotError, type LotDeps } from "./lots";

export type LotGrantErrorCode = "NO_LOT" | "INACTIVE_LOT" | "NO_USER" | "NOT_ELIGIBLE" | "NOT_FOUND" | "DONE";

export class LotGrantError extends Error {
  constructor(readonly code: LotGrantErrorCode) {
    super(code);
  }
}

export const BROADCAST_AUDIENCES = ["ALL", "REGISTERED"] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

const TX = { maxWait: 10_000, timeout: 20_000 };
const BATCH = 100;

/** Joueurs qui peuvent recevoir un lot : ni bannis, ni anonymisés, ni en cours de suppression. */
function eligibleWhere(audience: BroadcastAudience): Prisma.UserWhereInput {
  return {
    bannedAt: null,
    anonymizedAt: null,
    deletionRequestedAt: null,
    ...(audience === "REGISTERED" ? { isGuest: false } : {}),
  };
}

async function activeLot(db: PrismaClient | Prisma.TransactionClient, lotId: string) {
  const lot = await db.lot.findUnique({ where: { id: lotId }, select: { id: true, active: true } });
  if (!lot) throw new LotGrantError("NO_LOT");
  if (!lot.active) throw new LotGrantError("INACTIVE_LOT");
}

/** Verse un lot à un seul joueur (un seul envoi = un versement, AdminLog LOT_GRANT). */
export async function grantLotToUserWith(
  db: PrismaClient,
  input: { adminId: string; lotId: string; userId: string; reason: string | null; now: Date },
  deps: LotDeps,
  onNotified?: OnNotified,
): Promise<{ grantId: string }> {
  await activeLot(db, input.lotId);
  return notifyingTransaction(
    db,
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!user) throw new LotGrantError("NO_USER");
      if ((await tx.user.count({ where: { id: input.userId, ...eligibleWhere("ALL") } })) === 0) {
        throw new LotGrantError("NOT_ELIGIBLE");
      }

      const grant = await tx.lotGrant.create({
        data: { lotId: input.lotId, userId: input.userId, adminId: input.adminId, reason: input.reason },
        select: { id: true },
      });
      const granted = await grantLot(tx, input.userId, input.lotId, { reason: "ADMIN", refId: grant.id }, deps, input.now).catch((e) => {
        throw e instanceof LotError ? new LotGrantError("NO_LOT") : e;
      });
      await notify(tx, { userId: input.userId, type: "LOT_GRANTED", actorId: input.adminId, refId: grant.id, now: input.now });
      await writeAdminLog(tx, {
        adminId: input.adminId,
        action: "LOT_GRANT",
        targetType: "User",
        targetId: input.userId,
        after: {
          lotId: input.lotId,
          grantId: grant.id,
          reason: input.reason,
          zeni: granted.zeni,
          boosters: granted.boosters.reduce((n, b) => n + b.count, 0),
          cards: granted.cards.length,
        },
      });
      return { grantId: grant.id };
    },
    TX,
    onNotified,
  );
}

/** Ouvre un envoi à tous (traité ensuite par runLotBroadcastWith). */
export async function startLotBroadcastWith(
  db: PrismaClient,
  input: { adminId: string; lotId: string; audience: BroadcastAudience; reason: string | null },
): Promise<{ broadcastId: string; eligible: number }> {
  await activeLot(db, input.lotId);
  const eligible = await db.user.count({ where: eligibleWhere(input.audience) });
  const broadcast = await db.$transaction(async (tx) => {
    const row = await tx.lotBroadcast.create({
      data: { lotId: input.lotId, adminId: input.adminId, audience: input.audience, reason: input.reason },
      select: { id: true },
    });
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "LOT_BROADCAST_START",
      targetType: "Lot",
      targetId: input.lotId,
      after: { broadcastId: row.id, audience: input.audience, eligible, reason: input.reason },
    });
    return row;
  });
  return { broadcastId: broadcast.id, eligible };
}

/**
 * Traite un envoi à tous jusqu'à la fin ou jusqu'au budget de temps. Idempotent : un joueur déjà
 * servi (contrainte unique) est sauté ; on peut relancer après une coupure.
 */
export async function runLotBroadcastWith(
  db: PrismaClient,
  input: { broadcastId: string; now: Date; budgetMs: number },
  deps: LotDeps,
  onNotified?: OnNotified,
): Promise<{ granted: number; done: boolean }> {
  const started = Date.now();
  const broadcast = await db.lotBroadcast.findUnique({
    where: { id: input.broadcastId },
    select: { id: true, lotId: true, adminId: true, audience: true, status: true, lastUserId: true, granted: true },
  });
  if (!broadcast) throw new LotGrantError("NOT_FOUND");
  if (broadcast.status === "DONE") return { granted: broadcast.granted, done: true };
  const audience: BroadcastAudience = broadcast.audience === "REGISTERED" ? "REGISTERED" : "ALL";

  let cursor = broadcast.lastUserId;
  for (;;) {
    if (Date.now() - started > input.budgetMs) break;
    const batch = await db.user.findMany({
      where: { ...eligibleWhere(audience), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true },
    });
    if (batch.length === 0) {
      await db.$transaction(async (tx) => {
        await tx.lotBroadcast.update({ where: { id: broadcast.id }, data: { status: "DONE", finishedAt: new Date() } });
        const row = await tx.lotBroadcast.findUniqueOrThrow({ where: { id: broadcast.id }, select: { granted: true } });
        await writeAdminLog(tx, {
          adminId: broadcast.adminId,
          action: "LOT_BROADCAST_DONE",
          targetType: "Lot",
          targetId: broadcast.lotId,
          after: { broadcastId: broadcast.id, granted: row.granted },
        });
      });
      const final = await db.lotBroadcast.findUniqueOrThrow({ where: { id: broadcast.id }, select: { granted: true } });
      return { granted: final.granted, done: true };
    }
    for (const { id: userId } of batch) {
      if (Date.now() - started > input.budgetMs) break;
      try {
        await notifyingTransaction(
          db,
          async (tx) => {
            await tx.lotGrant.create({ data: { lotId: broadcast.lotId, userId, adminId: broadcast.adminId, broadcastId: broadcast.id } });
            await grantLot(tx, userId, broadcast.lotId, { reason: "ADMIN", refId: broadcast.id }, deps, input.now);
            await notify(tx, { userId, type: "LOT_GRANTED", actorId: broadcast.adminId, refId: broadcast.id, now: input.now });
            await tx.lotBroadcast.update({ where: { id: broadcast.id }, data: { granted: { increment: 1 }, lastUserId: userId } });
          },
          TX,
          onNotified,
        );
      } catch (e) {
        // Déjà servi (envoi relancé en parallèle) : on avance sans rien verser
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        await db.lotBroadcast.update({ where: { id: broadcast.id }, data: { lastUserId: userId } });
      }
      cursor = userId;
    }
  }
  const row = await db.lotBroadcast.findUniqueOrThrow({ where: { id: broadcast.id }, select: { granted: true } });
  return { granted: row.granted, done: false };
}
