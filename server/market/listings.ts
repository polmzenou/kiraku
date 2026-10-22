import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CardView, OpenedCardView } from "@/lib/boosters/view";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import type { ListingFilter } from "@/lib/market/listings";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import type { PlayerRef } from "../social/queries";
import { expireListingsFor } from "./listing-core";

// Lectures des échanges ouverts du Marché : onglets « Échanges » et « Mes échanges » de /marche.
// Seuls des champs publics des autres joueurs sortent d'ici (pseudo, avatar, statut invité).

export const LISTINGS_PAGE_SIZE = 20;
export const WANTABLE_PAGE_SIZE = 24;
const HISTORY_SIZE = 20;

const playerSelect = { id: true, username: true, image: true, isGuest: true } as const;

export type ListingWantView = CardView & { /** Le lecteur en a un exemplaire libre. */ givable: boolean };

export type ListingView = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  owner: PlayerRef;
  card: CardView;
  /** Commentaire public de l'auteur (texte brut). */
  note: string | null;
  wants: ListingWantView[];
  /** Annonce du lecteur. */
  mine: boolean;
  /** Offres en attente (seulement sur ses propres annonces). */
  offerCount: number;
  /** Offre en attente du lecteur sur cette annonce. */
  myOffer: { id: string; card: CardView } | null;
};

export type ListingPage = { items: ListingView[]; nextCursor: string | null };

/** Joueurs bloqués par le lecteur ou qui l'ont bloqué : leurs annonces n'apparaissent pas. */
async function blockedIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)))];
}

/** Paires (joueur, carte) dont le joueur a un exemplaire en collection. */
async function freePairs(pairs: readonly { ownerId: string; cardId: string }[]): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();
  const rows = await prisma.userCard.groupBy({
    by: ["ownerId", "cardId"],
    where: { status: "COLLECTION", OR: pairs.map((p) => ({ ownerId: p.ownerId, cardId: p.cardId })) },
  });
  return new Set(rows.map((r) => `${r.ownerId}:${r.cardId}`));
}

/** Annonces ouvertes, les plus récentes d'abord, filtrées et paginées par id (curseur). */
export async function listListings(input: {
  viewerId: string;
  q: string;
  filter: ListingFilter;
  cursor: string | null;
  locale: string;
  now?: Date;
}): Promise<ListingPage> {
  const now = input.now ?? new Date();
  const q = normalizeSearch(input.q.slice(0, SEARCH_MAX_LENGTH));
  const blocked = await blockedIds(input.viewerId);
  const others = input.filter === "missing" || input.filter === "canAccept";
  const excluded = others ? [...blocked, input.viewerId] : blocked;
  const and: Prisma.TradeListingWhereInput[] = [];
  if (q) and.push({ OR: [{ card: { searchText: { contains: q } } }, { owner: { username: { contains: q, mode: "insensitive" } } }] });
  if (input.filter === "missing") and.push({ card: { copies: { none: { ownerId: input.viewerId } } } });
  if (input.filter === "canAccept") and.push({ wants: { some: { card: { copies: { some: { ownerId: input.viewerId, status: "COLLECTION" } } } } } });
  if (input.filter === "mine") and.push({ offers: { some: { bidderId: input.viewerId, status: "PENDING" } } });
  const where: Prisma.TradeListingWhereInput = {
    status: "OPEN",
    expiresAt: { gt: now },
    owner: { bannedAt: null },
    ...(excluded.length ? { ownerId: { notIn: excluded } } : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const rows = await prisma.tradeListing.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LISTINGS_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      cardId: true,
      note: true,
      owner: { select: playerSelect },
      wants: { select: { cardId: true } },
      offers: { where: { status: "PENDING" }, select: { id: true, bidderId: true, cardId: true } },
    },
  });
  const page = rows.slice(0, LISTINGS_PAGE_SIZE);
  const nextCursor = rows.length > LISTINGS_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null;

  const wantIds = [...new Set(page.flatMap((r) => r.wants.map((w) => w.cardId)))];
  const [ownerFree, viewerFree, views] = await Promise.all([
    freePairs(page.map((r) => ({ ownerId: r.owner.id, cardId: r.cardId }))),
    wantIds.length
      ? prisma.userCard.groupBy({ by: ["cardId"], where: { ownerId: input.viewerId, status: "COLLECTION", cardId: { in: wantIds } } })
      : Promise.resolve([]),
    cardViews(
      page.flatMap((r) => [r.cardId, ...r.wants.map((w) => w.cardId), ...r.offers.map((o) => o.cardId)]),
      input.locale,
    ),
  ]);
  const givable = new Set(viewerFree.map((r) => r.cardId));

  const items = page.flatMap((r): ListingView[] => {
    const card = views.get(r.cardId);
    // Une annonce dont l'auteur n'a plus d'exemplaire libre ne peut pas conclure : on la tait
    if (!card || !ownerFree.has(`${r.owner.id}:${r.cardId}`)) return [];
    const mine = r.owner.id === input.viewerId;
    const myOffer = r.offers.find((o) => o.bidderId === input.viewerId);
    const myOfferCard = myOffer ? views.get(myOffer.cardId) : undefined;
    return [
      {
        id: r.id,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        owner: r.owner,
        card,
        note: r.note,
        wants: r.wants.flatMap((w) => {
          const view = views.get(w.cardId);
          return view ? [{ ...view, givable: !mine && givable.has(w.cardId) }] : [];
        }),
        mine,
        offerCount: mine ? r.offers.length : 0,
        myOffer: myOffer && myOfferCard ? { id: myOffer.id, card: myOfferCard } : null,
      },
    ];
  });
  return { items, nextCursor };
}

export type ReceivedOfferView = { id: string; createdAt: Date; fromWants: boolean; bidder: PlayerRef; card: CardView };

export type MyListingView = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  card: CardView;
  note: string | null;
  wants: CardView[];
  offers: ReceivedOfferView[];
};

export type SentOfferView = {
  id: string;
  createdAt: Date;
  card: CardView;
  listing: { id: string; expiresAt: Date; owner: PlayerRef; card: CardView; note: string | null };
};

export type ExchangeHistoryView = {
  id: string;
  kind: "listing" | "offer";
  status: string;
  resolvedAt: Date | null;
  gave: CardView;
  got: CardView | null;
  other: PlayerRef | null;
  /** Motif écrit par l'auteur de l'annonce quand il a refusé l'offre du lecteur. */
  declineNote: string | null;
};

export type MyExchanges = {
  listings: MyListingView[];
  sent: SentOfferView[];
  history: ExchangeHistoryView[];
  /** Cartes reçues en tant qu'offrant dont la révélation n'a pas encore été vue. */
  reveals: { offerIds: string[]; cards: OpenedCardView[] };
};

/** Tout ce que « Mes échanges » affiche, après le balayage paresseux des annonces échues. */
export async function listMyExchanges(userId: string, locale: string, now = new Date()): Promise<MyExchanges> {
  await expireListingsFor(prisma, userId, now);
  const [open, sent, pastListings, pastOffers, unseen] = await Promise.all([
    prisma.tradeListing.findMany({
      where: { ownerId: userId, status: "OPEN", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        cardId: true,
        note: true,
        wants: { select: { cardId: true } },
        offers: {
          where: { status: "PENDING", bidder: { bannedAt: null } },
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, fromWants: true, cardId: true, bidder: { select: playerSelect } },
        },
      },
    }),
    prisma.listingOffer.findMany({
      where: { bidderId: userId, status: "PENDING", listing: { status: "OPEN", expiresAt: { gt: now } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        cardId: true,
        listing: { select: { id: true, expiresAt: true, cardId: true, note: true, owner: { select: playerSelect } } },
      },
    }),
    prisma.tradeListing.findMany({
      where: { ownerId: userId, status: { not: "OPEN" } },
      orderBy: { resolvedAt: "desc" },
      take: HISTORY_SIZE,
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        cardId: true,
        offers: { where: { status: "ACCEPTED" }, take: 1, select: { cardId: true, bidder: { select: playerSelect } } },
      },
    }),
    prisma.listingOffer.findMany({
      where: { bidderId: userId, status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: HISTORY_SIZE,
      select: { id: true, status: true, resolvedAt: true, cardId: true, declineNote: true, listing: { select: { cardId: true, owner: { select: playerSelect } } } },
    }),
    prisma.listingOffer.findMany({
      where: { bidderId: userId, status: "ACCEPTED", bidderSeenAt: null },
      take: 20,
      select: { id: true, bidderNew: true, listing: { select: { cardId: true } } },
    }),
  ]);

  const views = await cardViews(
    [
      ...open.flatMap((l) => [l.cardId, ...l.wants.map((w) => w.cardId), ...l.offers.map((o) => o.cardId)]),
      ...sent.flatMap((o) => [o.cardId, o.listing.cardId]),
      ...pastListings.flatMap((l) => [l.cardId, ...l.offers.map((o) => o.cardId)]),
      ...pastOffers.flatMap((o) => [o.cardId, o.listing.cardId]),
      ...unseen.map((o) => o.listing.cardId),
    ],
    locale,
  );

  const history: ExchangeHistoryView[] = [
    ...pastListings.flatMap((l): ExchangeHistoryView[] => {
      const gave = views.get(l.cardId);
      const accepted = l.offers[0];
      return gave
        ? [{ id: l.id, kind: "listing", status: l.status, resolvedAt: l.resolvedAt, gave, got: accepted ? (views.get(accepted.cardId) ?? null) : null, other: accepted?.bidder ?? null, declineNote: null }]
        : [];
    }),
    ...pastOffers.flatMap((o): ExchangeHistoryView[] => {
      const gave = views.get(o.cardId);
      return gave
        ? [{ id: o.id, kind: "offer", status: o.status, resolvedAt: o.resolvedAt, gave, got: views.get(o.listing.cardId) ?? null, other: o.listing.owner, declineNote: o.declineNote }]
        : [];
    }),
  ]
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0))
    .slice(0, HISTORY_SIZE);

  return {
    listings: open.flatMap((l): MyListingView[] => {
      const card = views.get(l.cardId);
      if (!card) return [];
      return [
        {
          id: l.id,
          createdAt: l.createdAt,
          expiresAt: l.expiresAt,
          card,
          note: l.note,
          wants: l.wants.flatMap((w) => views.get(w.cardId) ?? []),
          offers: l.offers.flatMap((o) => {
            const offered = views.get(o.cardId);
            return offered ? [{ id: o.id, createdAt: o.createdAt, fromWants: o.fromWants, bidder: o.bidder, card: offered }] : [];
          }),
        },
      ];
    }),
    sent: sent.flatMap((o): SentOfferView[] => {
      const card = views.get(o.cardId);
      const listingCard = views.get(o.listing.cardId);
      return card && listingCard
        ? [{ id: o.id, createdAt: o.createdAt, card, listing: { id: o.listing.id, expiresAt: o.listing.expiresAt, owner: o.listing.owner, card: listingCard, note: o.listing.note } }]
        : [];
    }),
    history,
    reveals: {
      offerIds: unseen.map((o) => o.id),
      cards: unseen.flatMap((o) => {
        const view = views.get(o.listing.cardId);
        return view ? [{ ...view, userCardId: `listing-${o.id}`, isNew: o.bidderNew, featured: false }] : [];
      }),
    },
  };
}

/** Offres reçues encore ouvertes (pastille de l'onglet « Mes échanges »). */
export function countIncomingOffers(userId: string, now = new Date()) {
  return prisma.listingOffer.count({
    where: { status: "PENDING", bidder: { bannedAt: null }, listing: { ownerId: userId, status: "OPEN", expiresAt: { gt: now } } },
  });
}

/**
 * Cartes du catalogue que le joueur ne possède pas, pour choisir les cartes demandées d'une annonce.
 * Les plus populaires d'abord (rang AniList), recherche sur le nom et la série.
 */
export async function searchWantableCards(input: { userId: string; q: string; offset: number; locale: string }) {
  const q = normalizeSearch(input.q.slice(0, SEARCH_MAX_LENGTH));
  const rows = await prisma.card.findMany({
    where: { status: "PUBLISHED", copies: { none: { ownerId: input.userId } }, ...(q ? { searchText: { contains: q } } : {}) },
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    skip: input.offset,
    take: WANTABLE_PAGE_SIZE + 1,
    select: { id: true },
  });
  const ids = rows.slice(0, WANTABLE_PAGE_SIZE).map((r) => r.id);
  const views = await cardViews(ids, input.locale);
  return {
    items: ids.flatMap((id) => views.get(id) ?? []),
    nextOffset: rows.length > WANTABLE_PAGE_SIZE ? input.offset + WANTABLE_PAGE_SIZE : null,
  };
}

/**
 * Visuels d'une notification d'échange ouvert (offre reçue, acceptée ou refusée) : la carte de
 * l'annonce, la carte proposée, et si l'offre attend encore une réponse.
 */
export async function listingOfferNotices(offerIds: readonly string[], locale: string, now = new Date()) {
  if (offerIds.length === 0) return new Map<string, { pending: boolean; own: CardView; offered: CardView }>();
  const rows = await prisma.listingOffer.findMany({
    where: { id: { in: [...offerIds] } },
    select: { id: true, status: true, cardId: true, listing: { select: { status: true, expiresAt: true, cardId: true } } },
  });
  const views = await cardViews(rows.flatMap((r) => [r.cardId, r.listing.cardId]), locale);
  const out = new Map<string, { pending: boolean; own: CardView; offered: CardView }>();
  for (const r of rows) {
    const own = views.get(r.listing.cardId);
    const offered = views.get(r.cardId);
    if (!own || !offered) continue;
    out.set(r.id, { pending: r.status === "PENDING" && r.listing.status === "OPEN" && r.listing.expiresAt > now, own, offered });
  }
  return out;
}
