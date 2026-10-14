// Demandes d'amis et blocage, atomiques. Le client Prisma est injecté (serveur ou test de
// concurrence). Les deux joueurs sont verrouillés dans l'ordre des ids ; pairKey garantit en base
// une seule ligne Friendship par paire, quel que soit le sens.
import type { PrismaClient } from "@/generated/prisma/client";
import { decideSend, pairKey } from "@/lib/social/relation";
import { blocksBetween, lockPlayers, type Tx } from "./lock";
import { notify, notifyingTransaction, retractFriendRequest, settleFriendRequest, type OnNotified } from "./notify";

export type SocialErrorCode =
  | "NO_USER"
  | "BANNED"
  | "GUEST"
  | "NOT_FOUND"
  | "SELF"
  | "BLOCKED_BY_ME"
  | "LIMIT_FRIENDS"
  | "LIMIT_OUTGOING";

export class SocialError extends Error {
  constructor(readonly code: SocialErrorCode) {
    super(code);
  }
}

export type FriendLimits = { maxFriends: number; maxOutgoing: number; cooldownHours: number };

const TX = { maxWait: 10_000, timeout: 15_000 };

async function lockPair(tx: Tx, me: string, other: string) {
  const players = await lockPlayers(tx, [me, other]);
  const self = players.get(me);
  if (!self) throw new SocialError("NO_USER");
  if (self.bannedAt) throw new SocialError("BANNED");
  if (self.isGuest) throw new SocialError("GUEST");
  return { self, other: players.get(other) ?? null };
}

function countFriends(tx: Tx, userId: string) {
  return tx.friendship.count({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
}

async function startCooldown(tx: Tx, key: string, hours: number, now: Date) {
  if (hours <= 0) return;
  const until = new Date(now.getTime() + hours * 3_600_000);
  await tx.friendRequestCooldown.upsert({ where: { pairKey: key }, create: { pairKey: key, until }, update: { until } });
}

export type SendOutcome = "SENT" | "ACCEPTED" | "ALREADY";

/**
 * Demande d'ami de `senderId` à `targetId`. « SENT » couvre aussi les demandes enregistrées
 * déjà refusées (cible qui m'a bloqué, invitée, bannie, pleine, ou délai en cours) : l'expéditeur
 * ne peut pas les distinguer d'une vraie demande.
 */
export async function sendRequestWith(
  db: PrismaClient,
  senderId: string,
  targetId: string,
  limits: FriendLimits,
  onNotified?: OnNotified,
): Promise<SendOutcome> {
  if (senderId === targetId) throw new SocialError("SELF");
  return notifyingTransaction(db, async (tx) => {
    const { other } = await lockPair(tx, senderId, targetId);
    if (!other) throw new SocialError("NOT_FOUND");
    const key = pairKey(senderId, targetId);
    const now = new Date();

    const [row, blocks, cooldown, senderFriends, senderOutgoing, targetFriends] = await Promise.all([
      tx.friendship.findUnique({
        where: { pairKey: key },
        select: { id: true, requesterId: true, addresseeId: true, status: true, declinedAt: true },
      }),
      blocksBetween(tx, senderId, targetId),
      tx.friendRequestCooldown.findUnique({ where: { pairKey: key }, select: { until: true } }),
      countFriends(tx, senderId),
      tx.friendship.count({ where: { requesterId: senderId, status: "PENDING" } }),
      countFriends(tx, targetId),
    ]);

    const decision = decideSend(
      {
        senderId,
        row,
        blocks,
        targetEligible: !other.isGuest && !other.bannedAt,
        cooldownActive: cooldown !== null && cooldown.until > now,
        senderFriends,
        senderOutgoing,
        targetFriends,
        limits: { maxFriends: limits.maxFriends, maxOutgoing: limits.maxOutgoing },
      },
      targetId,
    );

    switch (decision) {
      case "CREATE": {
        const created = await tx.friendship.create({
          data: { pairKey: key, requesterId: senderId, addresseeId: targetId, createdAt: now },
          select: { id: true },
        });
        await notify(tx, { userId: targetId, type: "FRIEND_REQUEST", actorId: senderId, refId: created.id, now });
        return "SENT";
      }
      case "SILENT":
        // Demande enregistrée déjà refusée : l'expéditeur la voit en attente, la cible jamais
        if (!row) {
          await tx.friendship.create({
            data: { pairKey: key, requesterId: senderId, addresseeId: targetId, createdAt: now, declinedAt: now },
          });
        }
        return "SENT";
      case "ACCEPT":
        await tx.friendship.update({
          where: { pairKey: key },
          data: { status: "ACCEPTED", acceptedAt: now, declinedAt: null },
        });
        await settleFriendRequest(tx, senderId, targetId, now);
        await notify(tx, { userId: targetId, type: "FRIEND_ACCEPTED", actorId: senderId, refId: row!.id, now });
        return "ACCEPTED";
      case "ALREADY":
        return "ALREADY";
      default:
        throw new SocialError(decision);
    }
  }, TX, onNotified);
}

/** Réponse à une demande reçue : seul le destinataire d'une demande encore visible peut répondre. */
export async function respondWith(
  db: PrismaClient,
  userId: string,
  requesterId: string,
  accept: boolean,
  limits: FriendLimits,
  onNotified?: OnNotified,
): Promise<void> {
  await notifyingTransaction(db, async (tx) => {
    await lockPair(tx, userId, requesterId);
    const now = new Date();
    const row = await tx.friendship.findUnique({
      where: { pairKey: pairKey(userId, requesterId) },
      select: { id: true, addresseeId: true, status: true, declinedAt: true },
    });
    // Propriété : la demande doit m'être adressée et ne pas être déjà refusée
    if (!row || row.status !== "PENDING" || row.addresseeId !== userId || row.declinedAt) {
      throw new SocialError("NOT_FOUND");
    }
    if (accept && (await countFriends(tx, userId)) >= limits.maxFriends) throw new SocialError("LIMIT_FRIENDS");
    await settleFriendRequest(tx, userId, requesterId, now);
    if (!accept) {
      // Refus silencieux : l'expéditeur n'est pas prévenu et ne peut pas relancer
      await tx.friendship.update({ where: { id: row.id }, data: { declinedAt: now } });
      return;
    }
    await tx.friendship.update({ where: { id: row.id }, data: { status: "ACCEPTED", acceptedAt: now } });
    await notify(tx, { userId: requesterId, type: "FRIEND_ACCEPTED", actorId: userId, refId: row.id, now });
  }, TX, onNotified);
}

/** Annule une demande envoyée ; un délai empêche de la renvoyer aussitôt (pas de spam). */
export async function cancelWith(db: PrismaClient, userId: string, addresseeId: string, limits: FriendLimits) {
  await db.$transaction(async (tx) => {
    await lockPair(tx, userId, addresseeId);
    const key = pairKey(userId, addresseeId);
    const res = await tx.friendship.deleteMany({ where: { pairKey: key, requesterId: userId, status: "PENDING" } });
    if (res.count !== 1) throw new SocialError("NOT_FOUND");
    await retractFriendRequest(tx, addresseeId, userId);
    await startCooldown(tx, key, limits.cooldownHours, new Date());
  }, TX);
}

/** Retire un ami (des deux côtés), avec le même délai avant une nouvelle demande. */
export async function removeFriendWith(db: PrismaClient, userId: string, friendId: string, limits: FriendLimits) {
  await db.$transaction(async (tx) => {
    await lockPair(tx, userId, friendId);
    const key = pairKey(userId, friendId);
    const res = await tx.friendship.deleteMany({ where: { pairKey: key, status: "ACCEPTED" } });
    if (res.count !== 1) throw new SocialError("NOT_FOUND");
    await startCooldown(tx, key, limits.cooldownHours, new Date());
  }, TX);
}

/**
 * Bloque un joueur : amitié et demandes supprimées, ses notifications effacées. Le bloqué n'est
 * pas prévenu ; ses demandes suivantes sont enregistrées comme refusées.
 */
export async function blockWith(db: PrismaClient, userId: string, targetId: string) {
  if (userId === targetId) throw new SocialError("SELF");
  await db.$transaction(async (tx) => {
    const players = await lockPlayers(tx, [userId, targetId]);
    if (!players.has(userId)) throw new SocialError("NO_USER");
    if (!players.has(targetId)) throw new SocialError("NOT_FOUND");
    await tx.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
    await tx.friendship.deleteMany({ where: { pairKey: pairKey(userId, targetId) } });
    await tx.notification.deleteMany({ where: { userId, actorId: targetId } });
    await retractFriendRequest(tx, targetId, userId);
  }, TX);
}

export async function unblockWith(db: PrismaClient, userId: string, targetId: string) {
  await db.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
}
