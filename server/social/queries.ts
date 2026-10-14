import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { parseGiftPayload, type GiftPayload, type NotificationType } from "@/lib/social/notifications";
import { pairKey, relationBetween, type Relation } from "@/lib/social/relation";
import { prisma } from "../db";
import { giftDay } from "./gift-core";

// Lectures du social. Seuls des champs publics des autres joueurs sortent d'ici (pseudo, avatar,
// statut invité), jamais l'e-mail, le solde ni un joueur qui n'est pas lié au lecteur.

export type PlayerRef = { id: string; username: string; image: string | null; isGuest: boolean };

const playerSelect = { id: true, username: true, image: true, isGuest: true } as const;

export const FRIENDS_PAGE = 50;

/** Relation vue par `viewerId`, et date depuis laquelle ils sont amis. */
export const getRelation = cache(async (viewerId: string, otherId: string) => {
  const [row, blocks] = await Promise.all([
    prisma.friendship.findUnique({
      where: { pairKey: pairKey(viewerId, otherId) },
      select: { requesterId: true, addresseeId: true, status: true, declinedAt: true, acceptedAt: true },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: otherId },
          { blockerId: otherId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    }),
  ]);
  const byMe = blocks.some((b) => b.blockerId === viewerId);
  const byThem = blocks.some((b) => b.blockerId === otherId);
  const relation: Relation = relationBetween(viewerId, row, { byMe, byThem });
  return { relation, blockedByThem: byThem, friendsSince: relation === "FRIENDS" ? (row?.acceptedAt ?? null) : null };
});

/** Amis acceptés, triés par pseudo ; `q` filtre seulement parmi ses propres amis. */
export async function listFriends(userId: string, q: string, page: number): Promise<{ items: PlayerRef[]; hasMore: boolean }> {
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { sentFriends: { some: { addresseeId: userId, status: "ACCEPTED" } } },
        { recvFriends: { some: { requesterId: userId, status: "ACCEPTED" } } },
      ],
      ...(q ? { username: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { username: "asc" },
    skip: page * FRIENDS_PAGE,
    take: FRIENDS_PAGE + 1,
    select: playerSelect,
  });
  return { items: rows.slice(0, FRIENDS_PAGE), hasMore: rows.length > FRIENDS_PAGE };
}

/** Demandes reçues encore visibles (un refus les cache) et demandes envoyées. */
export async function listRequests(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING", declinedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { createdAt: true, requester: { select: playerSelect } },
    }),
    // Une demande refusée reste « en attente » pour l'expéditeur : le refus ne se voit pas
    prisma.friendship.findMany({
      where: { requesterId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { createdAt: true, addressee: { select: playerSelect } },
    }),
  ]);
  return {
    incoming: incoming.map((r) => ({ ...r.requester, since: r.createdAt })),
    outgoing: outgoing.map((r) => ({ ...r.addressee, since: r.createdAt })),
  };
}

export async function listBlocked(userId: string): Promise<PlayerRef[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { blocked: { select: playerSelect } },
  });
  return rows.map((r) => r.blocked);
}

export const countIncomingRequests = cache((userId: string) =>
  prisma.friendship.count({ where: { addresseeId: userId, status: "PENDING", declinedAt: null } }),
);

export const unreadNotifications = cache((userId: string) =>
  prisma.notification.count({ where: { userId, readAt: null } }),
);

/** Cadeaux déjà envoyés aujourd'hui (jour du jeu). */
export async function giftsSentToday(userId: string, timeZone: string) {
  return prisma.gift.count({ where: { senderId: userId, dayKey: giftDay(new Date(), timeZone) } });
}

// --- Notifications ---

export const NOTIFICATIONS_PAGE = 30;

export type NotificationView = {
  id: string;
  type: NotificationType;
  createdAt: Date;
  read: boolean;
  actor: PlayerRef | null;
  gift: GiftPayload | null;
  card: { anilistId: number; name: string; rarity: string } | null;
};

const notificationSelect = {
  id: true,
  type: true,
  createdAt: true,
  readAt: true,
  payload: true,
  actor: { select: playerSelect },
} as const;

/** Rien d'un joueur que le lecteur a bloqué depuis. */
const visibleTo = (userId: string) => ({
  userId,
  OR: [{ actorId: null }, { actor: { blockedBy: { none: { blockerId: userId } } } }],
});

type NotificationRow = {
  id: string;
  type: NotificationType;
  createdAt: Date;
  readAt: Date | null;
  payload: Prisma.JsonValue;
  actor: PlayerRef | null;
};

/** Lignes → vues : cartes offertes résolues en une seule requête. */
async function toViews(rows: NotificationRow[]): Promise<NotificationView[]> {
  const gifts = rows.map((r) => (r.type === "GIFT_RECEIVED" ? parseGiftPayload(r.payload) : null));
  const cardIds = [...new Set(gifts.flatMap((g) => (g?.kind === "CARD" ? [g.cardId] : [])))];
  const cards = cardIds.length
    ? await prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, anilistId: true, name: true, rarity: true } })
    : [];
  const cardById = new Map(cards.map((c) => [c.id, c]));

  return rows.map((r, i) => {
    const gift = gifts[i];
    const card = gift?.kind === "CARD" ? cardById.get(gift.cardId) : undefined;
    return {
      id: r.id,
      type: r.type,
      createdAt: r.createdAt,
      read: r.readAt !== null,
      actor: r.actor,
      gift,
      card: card ? { anilistId: card.anilistId, name: card.name, rarity: card.rarity } : null,
    };
  });
}

/**
 * Notifications du joueur, les plus récentes d'abord, par curseur (id de la dernière lue).
 * Le texte est rendu à la lecture : pseudo à jour, et rien d'un joueur bloqué depuis.
 */
export async function listNotifications(userId: string, cursor: string | null) {
  const rows = await prisma.notification.findMany({
    where: visibleTo(userId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATIONS_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: notificationSelect,
  });
  const page = rows.slice(0, NOTIFICATIONS_PAGE);
  return { items: await toViews(page), nextCursor: rows.length > NOTIFICATIONS_PAGE ? page[page.length - 1].id : null };
}

export const TOASTS_MAX = 3;

/**
 * Notifications non lues arrivées après `since` (toasts) : les plus récentes, au plus TOASTS_MAX,
 * et combien d'autres sont arrivées en plus.
 */
export async function notificationsSince(userId: string, since: Date) {
  const where = { ...visibleTo(userId), readAt: null, createdAt: { gt: since } };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TOASTS_MAX,
      select: notificationSelect,
    }),
    prisma.notification.count({ where }),
  ]);
  return { items: await toViews(rows), more: Math.max(0, total - rows.length) };
}

/** Purge paresseuse : les notifications lues plus vieilles que la rétention disparaissent. */
export async function purgeOldNotifications(userId: string, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  await prisma.notification.deleteMany({ where: { userId, readAt: { not: null }, createdAt: { lt: cutoff } } });
}

// --- Admin ---

export async function recentGifts(take = 50) {
  return prisma.gift.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      zeniSpent: true,
      createdAt: true,
      cardId: true,
      sender: { select: { username: true } },
      recipient: { select: { username: true } },
    },
  });
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Une notification pour le Web Push, telle que son destinataire la verrait : null si elle n'existe
 * pas (transaction annulée), est déjà lue ou vient d'un joueur bloqué entre-temps.
 */
export async function notificationForPush(id: string): Promise<(NotificationView & { userId: string }) | null> {
  const head = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!head) return null;
  const row = await prisma.notification.findFirst({
    where: { ...visibleTo(head.userId), id, readAt: null },
    select: notificationSelect,
  });
  if (!row) return null;
  const [view] = await toViews([row]);
  return { ...view, userId: head.userId };
}
