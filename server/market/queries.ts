import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CardView } from "@/lib/boosters/view";
import {
  encodeMarketCursor,
  MARKET_PAGE_SIZE,
  type MarketCursor,
  type MarketParams,
  type MarketSort,
} from "@/lib/market/filters";
import {
  bidBounds,
  buyoutAvailable,
  checkTrader,
  minNextBid,
  priceCap,
  sellInfoForRarity,
  type MarketRules,
  type SellBase,
  type SellInfo,
} from "@/lib/market/rules";
import type { ShownName } from "@/lib/collection/display-name";
import { shownPlayer, type ShownPlayer } from "@/lib/social/shown-player";
import { cardViews } from "../boosters/display";
import { copyMarksOf, withCopy } from "../prestige/copy-marks";
import { ownedCardIds } from "../collection/owned";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { prisma } from "../db";
import { pushLater } from "../push/send";
import { getSetting } from "../settings";
import { settleAuctionWith } from "./auction-core";

// Lectures de l'hôtel des ventes. Les ventes terminées affichées sont closes au passage (clôture
// paresseuse), comme celles du joueur à chaque sondage de la cloche ; le cron du marché (toutes les
// 5 minutes) balaie le reste.

// Web Push après la réponse : défini avec l'envoi (server/push/send.ts), gardé ici pour les modules qui l'importent du Marché
export { pushLater };

export async function getMarketRules(): Promise<MarketRules> {
  const [enabled, feeBp, minIncrementBp, antiSnipeSeconds, extendSeconds, durationsHours, maxActivePerSeller, minAccountAgeHours, minStartPrice, maxPrice, maxPriceByRarity] =
    await Promise.all([
      getSetting("market.enabled"),
      getSetting("market.feeBp"),
      getSetting("market.minIncrementBp"),
      getSetting("market.antiSnipeSeconds"),
      getSetting("market.extendSeconds"),
      getSetting("market.durationsHours"),
      getSetting("market.maxActivePerSeller"),
      getSetting("market.minAccountAgeHours"),
      getSetting("market.minStartPrice"),
      getSetting("market.maxPrice"),
      getSetting("market.maxPriceByRarity"),
    ]);
  return {
    enabled,
    feeBp,
    minIncrementBp,
    antiSnipeSeconds,
    extendSeconds,
    durationsHours: [...durationsHours].sort((a, b) => a - b),
    maxActivePerSeller,
    minAccountAgeHours,
    minStartPrice,
    maxPrice,
    maxPriceByRarity,
  };
}

/** Clôt les ventes terminées qu'on s'apprête à afficher. Une erreur n'empêche pas l'affichage. */
async function settleDue(where: Prisma.AuctionWhereInput, now: Date) {
  const due = await prisma.auction.findMany({
    where: { ...where, status: "ACTIVE", endsAt: { lte: now } },
    orderBy: { endsAt: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      await settleAuctionWith(prisma, id, now, pushLater);
    } catch (e) {
      console.error(`[marche] clôture paresseuse de ${id}`, e);
    }
  }
}

/**
 * Ventes terminées du joueur (vendeur ou meneur), closes à chaque sondage de la cloche : le gagnant
 * est prévenu et le vendeur payé en moins d'une minute tant qu'ils ont le jeu ouvert, sans attendre
 * le cron du marché (toutes les 5 minutes).
 */
export async function settleDueFor(userId: string, now: Date) {
  await settleDue({ OR: [{ sellerId: userId }, { currentBidderId: userId }] }, now);
}

export type AuctionStatusView = "ACTIVE" | "SOLD" | "EXPIRED" | "CANCELLED";

// La tuile ne montre pas le vendeur : ni son pseudo ni sa jointure ne sont lus pour la liste
export type AuctionListItem = {
  id: string;
  card: CardView;
  status: AuctionStatusView;
  price: number;
  bidCount: number;
  /** Prix d'achat immédiat s'il est encore proposé. */
  buyoutPrice: number | null;
  endsAt: Date;
  mine: boolean;
  leading: boolean;
  /** Le lecteur possède déjà cette carte (jamais sur ses propres ventes). */
  viewerOwns: boolean;
};

/** Joueur montré sur une fiche de vente : son pseudo décide aussi de l'affichage de son avatar. */
const shownPlayerSelect = { ...namedPlayerSelect, image: true } as const;

const listSelect = {
  id: true,
  cardId: true,
  userCardId: true,
  status: true,
  price: true,
  currentBid: true,
  currentBidderId: true,
  bidCount: true,
  buyoutPrice: true,
  endsAt: true,
  createdAt: true,
  sellerId: true,
} as const;

type ListRow = Prisma.AuctionGetPayload<{ select: typeof listSelect }>;

const SORTS: Record<MarketSort, { col: "endsAt" | "createdAt" | "price"; dir: "asc" | "desc" }> = {
  ending: { col: "endsAt", dir: "asc" },
  newest: { col: "createdAt", dir: "desc" },
  priceAsc: { col: "price", dir: "asc" },
  priceDesc: { col: "price", dir: "desc" },
};

function cursorValue(row: ListRow, sort: MarketSort): number {
  const { col } = SORTS[sort];
  return col === "price" ? row.price : row[col].getTime();
}

/** Lignes strictement après le curseur, dans l'ordre `col` `dir` (départage par id). */
function afterCursorOn(col: "endsAt" | "createdAt" | "price", dir: "asc" | "desc", c: MarketCursor): Prisma.AuctionWhereInput {
  const cmp = dir === "asc" ? "gt" : "lt";
  const value = col === "price" ? c.v : new Date(c.v);
  return {
    OR: [{ [col]: { [cmp]: value } }, { [col]: value, id: { [cmp]: c.id } }],
  } as Prisma.AuctionWhereInput;
}

/** Lignes strictement après le curseur, dans l'ordre du tri. */
function afterCursor(sort: MarketSort, c: MarketCursor): Prisma.AuctionWhereInput {
  const { col, dir } = SORTS[sort];
  return afterCursorOn(col, dir, c);
}

function scopeOf(params: MarketParams, viewerId: string | null, now: Date): Prisma.AuctionWhereInput | null {
  if (params.tab === "all") return { status: "ACTIVE", endsAt: { gt: now } };
  if (!viewerId) return null;
  return params.tab === "selling" ? { sellerId: viewerId } : { bids: { some: { bidderId: viewerId } } };
}

/** Une page du marché (ou de « Mes ventes », « Mes enchères »), par curseur. */
export async function listAuctions(input: {
  params: MarketParams;
  cursor: MarketCursor | null;
  viewerId: string | null;
  locale: string;
  now: Date;
}): Promise<{ items: AuctionListItem[]; nextCursor: string | null }> {
  const { params, viewerId, now } = input;
  const scope = scopeOf(params, viewerId, now);
  if (!scope) return { items: [], nextCursor: null };
  if (params.tab !== "all" && !input.cursor) await settleDue(scope, now);

  const card: Prisma.CardWhereInput = {
    ...(params.rarity ? { rarity: params.rarity } : {}),
    ...(params.q ? { searchText: { contains: params.q } } : {}),
  };
  const filters: Prisma.AuctionWhereInput[] = [
    scope,
    Object.keys(card).length > 0 ? { card } : {},
    params.minPrice !== null || params.maxPrice !== null
      ? { price: { ...(params.minPrice !== null ? { gte: params.minPrice } : {}), ...(params.maxPrice !== null ? { lte: params.maxPrice } : {}) } }
      : {},
    params.buyout ? { status: "ACTIVE", buyoutPrice: { not: null } } : {},
  ];
  const find = (extra: Prisma.AuctionWhereInput[], orderBy: Prisma.AuctionOrderByWithRelationInput[], take: number) =>
    prisma.auction.findMany({ where: { AND: [...filters, ...extra] }, orderBy, take, select: listSelect });

  // « Mes ventes » et « Mes enchères » au tri par défaut : les ventes en cours d'abord (la plus proche de sa fin en
  // tête), puis les closes, les plus récentes d'abord. Un seul tri « fin croissante » mettait en tête les ventes
  // closes depuis longtemps et repoussait les ventes en cours au-delà de la première page. Le curseur dit dans
  // quelle partie de la liste on en est.
  const split = params.tab !== "all" && params.sort === "ending";
  let rows: { row: ListRow; closed: boolean }[];
  if (!split) {
    const { col, dir } = SORTS[params.sort];
    const found = await find([input.cursor ? afterCursor(params.sort, input.cursor) : {}], [{ [col]: dir }, { id: dir }], MARKET_PAGE_SIZE + 1);
    rows = found.map((row) => ({ row, closed: false }));
  } else {
    const cursor = input.cursor;
    const active = cursor?.closed
      ? []
      : await find([{ status: "ACTIVE" }, cursor ? afterCursorOn("endsAt", "asc", cursor) : {}], [{ endsAt: "asc" }, { id: "asc" }], MARKET_PAGE_SIZE + 1);
    const room = MARKET_PAGE_SIZE + 1 - active.length;
    const closed =
      room > 0
        ? await find([{ status: { not: "ACTIVE" } }, cursor?.closed ? afterCursorOn("endsAt", "desc", cursor) : {}], [{ endsAt: "desc" }, { id: "desc" }], room)
        : [];
    rows = [...active.map((row) => ({ row, closed: false })), ...closed.map((row) => ({ row, closed: true }))];
  }
  const page = rows.slice(0, MARKET_PAGE_SIZE).map((r) => r.row);
  const [views, ownedIds, marks] = await Promise.all([
    cardViews(
      page.map((r) => r.cardId),
      input.locale,
    ),
    ownedCardIds(viewerId, page.map((r) => r.cardId)),
    // Héritière ou gravée mise en vente : l'acheteur voit l'exemplaire, pas seulement la carte
    copyMarksOf(page.map((r) => r.userCardId)),
  ]);
  const owned = new Set(ownedIds);
  const last = rows[MARKET_PAGE_SIZE - 1];
  return {
    items: page.flatMap((r) => {
      const view = views.get(r.cardId);
      if (!view) return [];
      return [
        {
          id: r.id,
          card: withCopy(view, r.userCardId, marks),
          status: r.status,
          price: r.price,
          bidCount: r.bidCount,
          buyoutPrice: r.status === "ACTIVE" && buyoutAvailable(r.buyoutPrice, r.currentBid) ? r.buyoutPrice : null,
          endsAt: r.endsAt,
          mine: r.sellerId === viewerId,
          leading: viewerId !== null && r.currentBidderId === viewerId,
          viewerOwns: r.sellerId !== viewerId && owned.has(r.cardId),
        },
      ];
    }),
    nextCursor:
      rows.length > MARKET_PAGE_SIZE && last
        ? encodeMarketCursor({ v: split ? last.row.endsAt.getTime() : cursorValue(last.row, params.sort), id: last.row.id, ...(last.closed && { closed: true }) })
        : null,
  };
}

/** État d'une vente qui change pendant qu'on la regarde (rafraîchi toutes les market.pollSeconds). */
export type AuctionLive = {
  status: AuctionStatusView;
  price: number;
  currentBid: number | null;
  minNext: number;
  /** Mise la plus haute acceptée (plafond de la rareté), null si le plafond est atteint. */
  maxBid: number | null;
  bidCount: number;
  endsAt: Date;
  buyoutPrice: number | null;
  leader: ShownPlayer | null;
  leading: boolean;
  finalPrice: number | null;
};

const liveSelect = {
  id: true,
  status: true,
  price: true,
  startPrice: true,
  currentBid: true,
  currentBidderId: true,
  bidCount: true,
  endsAt: true,
  buyoutPrice: true,
  finalPrice: true,
  currentBidder: { select: shownPlayerSelect },
  card: { select: { rarity: true } },
} as const;

function toLive(
  a: Prisma.AuctionGetPayload<{ select: typeof liveSelect }>,
  viewerId: string | null,
  rules: Pick<MarketRules, "minIncrementBp" | "maxPrice" | "maxPriceByRarity">,
  leaderName: ShownName | null,
): AuctionLive {
  const bounds = bidBounds(a.currentBid, a.startPrice, rules.minIncrementBp, priceCap(rules, a.card.rarity));
  const buyoutPrice = a.status === "ACTIVE" && buyoutAvailable(a.buyoutPrice, a.currentBid) ? a.buyoutPrice : null;
  const minNext = bounds?.min ?? minNextBid(a.currentBid, a.startPrice, rules.minIncrementBp);
  return {
    status: a.status,
    price: a.price,
    currentBid: a.currentBid,
    // Enchère à moins d'une surenchère de l'achat immédiat : la mise minimale est l'achat immédiat (jamais au-dessus)
    minNext: buyoutPrice !== null ? Math.min(minNext, buyoutPrice) : minNext,
    maxBid: bounds?.max ?? null,
    bidCount: a.bidCount,
    endsAt: a.endsAt,
    buyoutPrice,
    leader: a.currentBidder && leaderName !== null ? shownPlayer(leaderName, a.currentBidder) : null,
    leading: viewerId !== null && a.currentBidderId === viewerId,
    finalPrice: a.finalPrice,
  };
}

async function liveRules() {
  const [minIncrementBp, maxPrice, maxPriceByRarity] = await Promise.all([
    getSetting("market.minIncrementBp"),
    getSetting("market.maxPrice"),
    getSetting("market.maxPriceByRarity"),
  ]);
  return { minIncrementBp, maxPrice, maxPriceByRarity };
}

/**
 * Lit une vente (`read`) ; terminée mais pas encore close, elle est close avant d'être relue : l'état renvoyé est
 * le résultat, jamais une vente « en cours » déjà finie.
 */
async function readSettled<T extends { status: string; endsAt: Date }>(id: string, read: () => Promise<T | null>, now: Date): Promise<T | null> {
  const first = await read();
  if (!first || first.status !== "ACTIVE" || first.endsAt > now) return first;
  await settleDue({ id }, now);
  return read();
}

export async function auctionLive(id: string, viewerId: string | null, now: Date): Promise<AuctionLive | null> {
  const [rules, a] = await Promise.all([liveRules(), readSettled(id, () => prisma.auction.findUnique({ where: { id }, select: liveSelect }), now)]);
  if (!a) return null;
  return toLive(a, viewerId, rules, a.currentBidder ? (await publicNamesFor(viewerId, [a.currentBidder]))(a.currentBidder) : null);
}

export type AuctionDetail = {
  id: string;
  card: CardView;
  /** Le lecteur possède déjà cette carte (jamais sur ses propres ventes). */
  viewerOwns: boolean;
  seller: ShownPlayer;
  /** Commentaire du vendeur (texte brut). */
  note: string | null;
  startPrice: number;
  feeBp: number;
  fee: number | null;
  createdAt: Date;
  mine: boolean;
  live: AuctionLive;
  bids: { id: string; amount: number; createdAt: Date; bidder: ShownPlayer; me: boolean }[];
};

export const BID_HISTORY = 20;

/** La fiche entière en une lecture : état en direct, vendeur et dernières mises. */
const detailSelect = {
  ...liveSelect,
  cardId: true,
  userCardId: true,
  sellerId: true,
  feeBp: true,
  fee: true,
  createdAt: true,
  note: true,
  seller: { select: shownPlayerSelect },
  bids: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: BID_HISTORY,
    select: { id: true, amount: true, createdAt: true, bidderId: true, bidder: { select: shownPlayerSelect } },
  },
} as const satisfies Prisma.AuctionSelect;

/** Fiche d'une vente : carte, vendeur, état en direct et dernières mises. */
export async function getAuctionDetail(id: string, viewerId: string | null, locale: string, now: Date): Promise<AuctionDetail | null> {
  const [rules, a] = await Promise.all([liveRules(), readSettled(id, () => prisma.auction.findUnique({ where: { id }, select: detailSelect }), now)]);
  if (!a) return null;
  const [views, nameOf, owned, marks] = await Promise.all([
    cardViews([a.cardId], locale),
    publicNamesFor(viewerId, [a.seller, ...a.bids.map((b) => b.bidder), ...(a.currentBidder ? [a.currentBidder] : [])]),
    ownedCardIds(viewerId, [a.cardId]),
    copyMarksOf([a.userCardId]),
  ]);
  const card = views.get(a.cardId);
  if (!card) return null;
  const live = toLive(a, viewerId, rules, a.currentBidder ? nameOf(a.currentBidder) : null);
  return {
    id: a.id,
    card: withCopy(card, a.userCardId, marks),
    viewerOwns: a.sellerId !== viewerId && owned.length > 0,
    seller: shownPlayer(nameOf(a.seller), a.seller),
    note: a.note,
    startPrice: a.startPrice,
    feeBp: a.feeBp,
    fee: a.fee,
    createdAt: a.createdAt,
    mine: a.sellerId === viewerId,
    live,
    bids: a.bids.map((b) => ({ id: b.id, amount: b.amount, createdAt: b.createdAt, bidder: shownPlayer(nameOf(b.bidder), b.bidder), me: b.bidderId === viewerId })),
  };
}

/** Ventes ouvertes du joueur (limite affichée dans la feuille « Mettre en vente »). */
export async function activeAuctionCount(sellerId: string): Promise<number> {
  return prisma.auction.count({ where: { sellerId, status: "ACTIVE" } });
}

/**
 * Ce que la feuille « Mettre en vente » doit savoir, avant le choix de la carte (Marché) ;
 * createAuctionWith revérifie tout sous verrou.
 */
export async function sellBaseFor(userId: string, now: Date): Promise<SellBase> {
  const [rules, player, active] = await Promise.all([
    getMarketRules(),
    prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, bannedAt: true, createdAt: true, registeredAt: true } }),
    activeAuctionCount(userId),
  ]);
  return {
    durationsHours: [...rules.durationsHours],
    feeBp: rules.feeBp,
    minStartPrice: rules.minStartPrice,
    maxPrice: rules.maxPrice,
    maxPriceByRarity: rules.maxPriceByRarity,
    active,
    maxActive: rules.maxActivePerSeller,
    minAccountAgeHours: rules.minAccountAgeHours,
    block: player ? checkTrader(player, now, rules) : "BANNED",
  };
}

/** La même chose pour une carte de rareté `rarity` (fiche de la collection). */
export async function sellInfoFor(userId: string, now: Date, rarity: string): Promise<SellInfo> {
  return sellInfoForRarity(await sellBaseFor(userId, now), rarity);
}

/** Vente ouverte d'un exemplaire de cette carte, pour la fiche de la collection. */
export async function openAuctionsForCard(sellerId: string, cardId: string) {
  return prisma.auction.findMany({
    where: { sellerId, cardId, status: "ACTIVE" },
    orderBy: { endsAt: "asc" },
    select: { id: true, price: true, endsAt: true },
  });
}

// --- Admin ---

/**
 * Ventes ouvertes, avis de recherche ouverts, séquestre et taxes : la santé du marché pour /admin/marche
 * et /admin/economie. `escrow` compte les deux séquestres (mises en tête et prix des avis ouverts).
 */
export async function marketTotals(now: Date) {
  const since = new Date(now.getTime() - 86_400_000);
  const [active, sold, orders, filled] = await Promise.all([
    prisma.auction.aggregate({ where: { status: "ACTIVE" }, _count: true, _sum: { currentBid: true } }),
    prisma.auction.aggregate({ where: { status: "SOLD", settledAt: { gte: since } }, _count: true, _sum: { fee: true, finalPrice: true } }),
    prisma.buyOrder.aggregate({ where: { status: "OPEN" }, _count: true, _sum: { price: true } }),
    prisma.buyOrder.aggregate({ where: { status: "FILLED", filledAt: { gte: since } }, _count: true, _sum: { fee: true, price: true } }),
  ]);
  const ordersEscrow = orders._sum.price ?? 0;
  return {
    active: active._count,
    escrow: (active._sum.currentBid ?? 0) + ordersEscrow,
    orders: orders._count,
    ordersEscrow,
    sold24h: sold._count + filled._count,
    volume24h: (sold._sum.finalPrice ?? 0) + (filled._sum.price ?? 0),
    fees24h: (sold._sum.fee ?? 0) + (filled._sum.fee ?? 0),
  };
}

/** Ventes ouvertes, celles qui finissent le plus tôt d'abord. */
export async function adminActiveAuctions(locale: string, take = 50) {
  const rows = await prisma.auction.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ endsAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      cardId: true,
      price: true,
      bidCount: true,
      endsAt: true,
      seller: { select: { username: true } },
      currentBidder: { select: { username: true } },
    },
  });
  const views = await cardViews(
    rows.map((r) => r.cardId),
    locale,
  );
  return rows.map((r) => ({
    id: r.id,
    cardName: views.get(r.cardId)?.name ?? "?",
    price: r.price,
    bidCount: r.bidCount,
    endsAt: r.endsAt,
    sellerName: r.seller.username,
    leaderName: r.currentBidder?.username ?? null,
  }));
}

/**
 * Commentaires publics les plus récents (annonces d'échange ouvertes et ventes en cours), pour la
 * modération de /admin/marche.
 */
export async function adminRecentNotes(locale: string, take = 50) {
  const [listings, auctions] = await Promise.all([
    prisma.tradeListing.findMany({
      where: { status: "OPEN", note: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, cardId: true, note: true, createdAt: true, owner: { select: { username: true } } },
    }),
    prisma.auction.findMany({
      where: { status: "ACTIVE", note: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, cardId: true, note: true, createdAt: true, seller: { select: { username: true } } },
    }),
  ]);
  const views = await cardViews([...listings, ...auctions].map((r) => r.cardId), locale);
  return [
    ...listings.map((r) => ({ kind: "LISTING" as const, id: r.id, note: r.note!, createdAt: r.createdAt, author: r.owner.username, cardName: views.get(r.cardId)?.name ?? "?" })),
    ...auctions.map((r) => ({ kind: "AUCTION" as const, id: r.id, note: r.note!, createdAt: r.createdAt, author: r.seller.username, cardName: views.get(r.cardId)?.name ?? "?" })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, take);
}
