import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import {
  parseAuctionPayload,
  parseBattlePayload,
  parseGiftPayload,
  parseListingPayload,
  parseTeamGiftPayload,
  parseTradePayload,
  type AuctionPayload,
  type BattlePayload,
  type GiftPayload,
  type ListingPayload,
  type NotificationType,
  type TeamGiftPayload,
  type TradePayload,
} from "@/lib/social/notifications";
import { pairKey, relationBetween, type Relation } from "@/lib/social/relation";
import { getLocale } from "next-intl/server";
import type { CardView } from "@/lib/boosters/view";
import { prisma } from "../db";
import { listingOfferNotices } from "../market/listings";
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
  auction: AuctionPayload | null;
  battle: BattlePayload | null;
  trade: TradePayload | null;
  /** Échange ouvert du Marché (la carte de l'annonce est dans `card`). */
  listing: ListingPayload | null;
  /** Carte proposée par l'offrant (échanges ouverts). */
  offeredCard: { anilistId: number; name: string; rarity: string } | null;
  /** Visuels d'un échange ouvert, et si l'offre attend encore une réponse (page /notifications). */
  listingNotice: { pending: boolean; own: CardView; offered: CardView } | null;
  /** Cadeau de l'équipe depuis la fiche du joueur. */
  team: (TeamGiftPayload & { boosterSlug: string | null }) | null;
  /** Texte libre joint : mot de l'équipe (cadeaux, lots) ou motif d'un refus d'échange. */
  note: string | null;
  card: { anilistId: number; name: string; rarity: string } | null;
};

const notificationSelect = {
  id: true,
  type: true,
  createdAt: true,
  readAt: true,
  payload: true,
  refId: true,
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
  refId: string | null;
  actor: PlayerRef | null;
};

const AUCTION_TYPES: ReadonlySet<NotificationType> = new Set([
  "OUTBID",
  "AUCTION_WON",
  "AUCTION_SOLD",
  "AUCTION_EXPIRED",
  "AUCTION_CANCELLED",
]);

/**
 * Textes libres joints aux notifications, lus dans leur ligne d'origine (jamais dans le payload) :
 * mot de l'équipe d'un cadeau ou d'un lot, motif d'un refus d'échange ou d'offre.
 */
async function notesFor(rows: { id: string; type: NotificationType; refId: string | null }[]): Promise<Map<string, string>> {
  const refs = (types: NotificationType[]) => [...new Set(rows.flatMap((r) => (types.includes(r.type) && r.refId ? [r.refId] : [])))];
  const [teamIds, lotIds, tradeIds, offerIds] = [refs(["TEAM_GIFT"]), refs(["LOT_GRANTED"]), refs(["TRADE_DECLINED"]), refs(["LISTING_DECLINED"])];
  const [teams, grants, broadcasts, trades, offers] = await Promise.all([
    teamIds.length ? prisma.teamGift.findMany({ where: { id: { in: teamIds } }, select: { id: true, message: true } }) : [],
    // Un lot envoyé à un joueur pointe sur son LotGrant, un envoi à tous sur le LotBroadcast
    lotIds.length ? prisma.lotGrant.findMany({ where: { id: { in: lotIds } }, select: { id: true, message: true } }) : [],
    lotIds.length ? prisma.lotBroadcast.findMany({ where: { id: { in: lotIds } }, select: { id: true, message: true } }) : [],
    tradeIds.length ? prisma.trade.findMany({ where: { id: { in: tradeIds } }, select: { id: true, declineNote: true } }) : [],
    offerIds.length ? prisma.listingOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, declineNote: true } }) : [],
  ]);
  const byRef = new Map<string, string>();
  for (const row of [...teams, ...grants, ...broadcasts]) if (row.message) byRef.set(row.id, row.message);
  for (const row of [...trades, ...offers]) if (row.declineNote) byRef.set(row.id, row.declineNote);
  return new Map(rows.flatMap((r) => (r.refId && byRef.has(r.refId) ? [[r.id, byRef.get(r.refId)!] as const] : [])));
}

/** Lignes → vues : cartes offertes ou vendues résolues en une seule requête. */
async function toViews(rows: NotificationRow[]): Promise<NotificationView[]> {
  const gifts = rows.map((r) => (r.type === "GIFT_RECEIVED" ? parseGiftPayload(r.payload) : null));
  const auctions = rows.map((r) => (AUCTION_TYPES.has(r.type) ? parseAuctionPayload(r.payload) : null));
  const trades = rows.map((r) => (r.type.startsWith("TRADE_") ? parseTradePayload(r.payload) : null));
  const listings = rows.map((r) => (r.type.startsWith("LISTING_") ? parseListingPayload(r.payload) : null));
  const teams = rows.map((r) => (r.type === "TEAM_GIFT" ? parseTeamGiftPayload(r.payload) : null));
  const cardIds = [
    ...new Set([
      ...gifts.flatMap((g) => (g?.kind === "CARD" ? [g.cardId] : [])),
      ...auctions.flatMap((a) => (a ? [a.cardId] : [])),
      ...trades.flatMap((tr) => (tr ? [tr.cardId] : [])),
      ...listings.flatMap((l) => (l ? [l.cardId, l.offeredCardId] : [])),
      ...teams.flatMap((g) => (g?.kind === "CARD" ? [g.cardId] : [])),
    ]),
  ];
  const boosterTypeIds = [...new Set(teams.flatMap((g) => (g?.kind === "BOOSTER" ? [g.boosterTypeId] : [])))];
  const [cards, boosterTypes, notes] = await Promise.all([
    cardIds.length
      ? prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, anilistId: true, publicId: true, appearance: true, name: true, rarity: true } })
      : [],
    boosterTypeIds.length ? prisma.boosterType.findMany({ where: { id: { in: boosterTypeIds } }, select: { id: true, slug: true } }) : [],
    notesFor(rows),
  ]);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const slugById = new Map(boosterTypes.map((b) => [b.id, b.slug]));

  return rows.map((r, i) => {
    const gift = gifts[i];
    const auction = auctions[i];
    const trade = trades[i];
    const listing = listings[i];
    const team = teams[i];
    const offered = listing ? cardById.get(listing.offeredCardId) : undefined;
    const card =
      gift?.kind === "CARD"
        ? cardById.get(gift.cardId)
        : auction
          ? cardById.get(auction.cardId)
          : trade
            ? cardById.get(trade.cardId)
            : listing
              ? cardById.get(listing.cardId)
              : team?.kind === "CARD"
                ? cardById.get(team.cardId)
                : undefined;
    return {
      id: r.id,
      type: r.type,
      createdAt: r.createdAt,
      read: r.readAt !== null,
      actor: r.actor,
      gift,
      auction,
      battle: r.type === "BATTLE_INVITE" ? parseBattlePayload(r.payload) : null,
      trade,
      listing,
      offeredCard: offered ? { anilistId: offered.publicId, name: offered.name, rarity: offered.rarity } : null,
      listingNotice: null,
      team: team ? { ...team, boosterSlug: team.kind === "BOOSTER" ? (slugById.get(team.boosterTypeId) ?? null) : null } : null,
      note: notes.get(r.id) ?? null,
      card: card ? { anilistId: card.publicId, name: card.name, rarity: card.rarity } : null,
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
  const views = await toViews(page);
  // Échanges ouverts : les deux cartes en visuel, et les boutons tant que l'offre attend
  const offerIds = views.flatMap((v) => (v.listing ? [v.listing.offerId] : []));
  if (offerIds.length > 0) {
    const notices = await listingOfferNotices(offerIds, await getLocale());
    for (const v of views) if (v.listing) v.listingNotice = notices.get(v.listing.offerId) ?? null;
  }
  return { items: views, nextCursor: rows.length > NOTIFICATIONS_PAGE ? page[page.length - 1].id : null };
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
