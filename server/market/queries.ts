import "server-only";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { CardView } from "@/lib/boosters/view";
import {
  encodeMarketCursor,
  MARKET_PAGE_SIZE,
  type MarketCursor,
  type MarketParams,
  type MarketSort,
} from "@/lib/market/filters";
import { bidBounds, buyoutAvailable, checkTrader, minNextBid, priceCap, type MarketRules } from "@/lib/market/rules";
import { cardViews } from "../boosters/display";
import type { NameColorStyle } from "@/lib/profile/name-colors";
import { namedPlayerSelect, publicNamesFor, shownNameColor } from "../collection/public-names";
import { prisma } from "../db";
import { pushNotifications } from "../push/send";
import { getSetting } from "../settings";
import { settleAuctionWith } from "./auction-core";

// Lectures de l'hôtel des ventes. Les ventes terminées affichées sont closes au passage (clôture
// paresseuse), comme celles du joueur à chaque sondage de la cloche ; le cron quotidien balaie le reste.

/** Web Push des notifications créées, une fois la réponse envoyée (hors transaction). */
export const pushLater = (ids: string[]) => after(() => pushNotifications(ids));

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
 * Ventes terminées du joueur (vendeur ou meneur), closes à chaque sondage de la cloche : sur le
 * plan Hobby de Vercel, le cron ne passe qu'une fois par jour, c'est ce sondage qui prévient le
 * gagnant et paie le vendeur en moins d'une minute tant qu'ils ont le jeu ouvert.
 */
export async function settleDueFor(userId: string, now: Date) {
  await settleDue({ OR: [{ sellerId: userId }, { currentBidderId: userId }] }, now);
}

export type AuctionStatusView = "ACTIVE" | "SOLD" | "EXPIRED" | "CANCELLED";

export type AuctionListItem = {
  id: string;
  card: CardView;
  status: AuctionStatusView;
  price: number;
  hasBids: boolean;
  bidCount: number;
  /** Prix d'achat immédiat s'il est encore proposé. */
  buyoutPrice: number | null;
  endsAt: Date;
  /** null : profil caché à ce visiteur (« Un joueur »). */
  sellerName: string | null;
  mine: boolean;
  leading: boolean;
};

const listSelect = {
  id: true,
  cardId: true,
  status: true,
  price: true,
  currentBid: true,
  currentBidderId: true,
  bidCount: true,
  buyoutPrice: true,
  endsAt: true,
  createdAt: true,
  sellerId: true,
  seller: { select: namedPlayerSelect },
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

/** Lignes strictement après le curseur, dans l'ordre du tri (départage par id). */
function afterCursor(sort: MarketSort, c: MarketCursor): Prisma.AuctionWhereInput {
  const { col, dir } = SORTS[sort];
  const cmp = dir === "asc" ? "gt" : "lt";
  const value = col === "price" ? c.v : new Date(c.v);
  return {
    OR: [{ [col]: { [cmp]: value } }, { [col]: value, id: { [cmp]: c.id } }],
  } as Prisma.AuctionWhereInput;
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
  const where: Prisma.AuctionWhereInput = {
    AND: [
      scope,
      Object.keys(card).length > 0 ? { card } : {},
      params.minPrice !== null || params.maxPrice !== null
        ? { price: { ...(params.minPrice !== null ? { gte: params.minPrice } : {}), ...(params.maxPrice !== null ? { lte: params.maxPrice } : {}) } }
        : {},
      params.buyout ? { status: "ACTIVE", buyoutPrice: { not: null } } : {},
      input.cursor ? afterCursor(params.sort, input.cursor) : {},
    ],
  };
  const { col, dir } = SORTS[params.sort];
  const rows = await prisma.auction.findMany({
    where,
    orderBy: [{ [col]: dir }, { id: dir }],
    take: MARKET_PAGE_SIZE + 1,
    select: listSelect,
  });
  const page = rows.slice(0, MARKET_PAGE_SIZE);
  const [views, nameOf] = await Promise.all([
    cardViews(
      page.map((r) => r.cardId),
      input.locale,
    ),
    publicNamesFor(viewerId, page.map((r) => r.seller)),
  ]);
  const last = page.at(-1);
  return {
    items: page.flatMap((r) => {
      const view = views.get(r.cardId);
      if (!view) return [];
      return [
        {
          id: r.id,
          card: view,
          status: r.status,
          price: r.price,
          hasBids: r.currentBid !== null,
          bidCount: r.bidCount,
          buyoutPrice: r.status === "ACTIVE" && buyoutAvailable(r.buyoutPrice, r.currentBid) ? r.buyoutPrice : null,
          endsAt: r.endsAt,
          sellerName: nameOf(r.seller),
          mine: r.sellerId === viewerId,
          leading: viewerId !== null && r.currentBidderId === viewerId,
        },
      ];
    }),
    nextCursor: rows.length > MARKET_PAGE_SIZE && last ? encodeMarketCursor({ v: cursorValue(last, params.sort), id: last.id }) : null,
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
  leaderName: string | null;
  leaderColor: NameColorStyle | null;
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
  currentBidder: { select: namedPlayerSelect },
  card: { select: { rarity: true } },
} as const;

function toLive(
  a: Prisma.AuctionGetPayload<{ select: typeof liveSelect }>,
  viewerId: string | null,
  rules: Pick<MarketRules, "minIncrementBp" | "maxPrice" | "maxPriceByRarity">,
  leaderName: string | null,
): AuctionLive {
  const bounds = bidBounds(a.currentBid, a.startPrice, rules.minIncrementBp, priceCap(rules, a.card.rarity));
  return {
    status: a.status,
    price: a.price,
    currentBid: a.currentBid,
    minNext: bounds?.min ?? minNextBid(a.currentBid, a.startPrice, rules.minIncrementBp),
    maxBid: bounds?.max ?? null,
    bidCount: a.bidCount,
    endsAt: a.endsAt,
    buyoutPrice: a.status === "ACTIVE" && buyoutAvailable(a.buyoutPrice, a.currentBid) ? a.buyoutPrice : null,
    leaderName,
    leaderColor: a.currentBidder ? shownNameColor(leaderName, a.currentBidder) : null,
    leading: viewerId !== null && a.currentBidderId === viewerId,
    finalPrice: a.finalPrice,
  };
}

export async function auctionLive(id: string, viewerId: string | null, now: Date): Promise<AuctionLive | null> {
  const [minIncrementBp, maxPrice, maxPriceByRarity, first] = await Promise.all([
    getSetting("market.minIncrementBp"),
    getSetting("market.maxPrice"),
    getSetting("market.maxPriceByRarity"),
    prisma.auction.findUnique({ where: { id }, select: liveSelect }),
  ]);
  if (!first) return null;
  const rules = { minIncrementBp, maxPrice, maxPriceByRarity };
  const withName = async (a: typeof first) =>
    toLive(a, viewerId, rules, a.currentBidder ? (await publicNamesFor(viewerId, [a.currentBidder]))(a.currentBidder) : null);
  if (first.status !== "ACTIVE" || first.endsAt > now) return withName(first);
  // Terminée mais pas encore close : on la clôt avant de répondre
  await settleDue({ id }, now);
  const a = await prisma.auction.findUnique({ where: { id }, select: liveSelect });
  return a ? withName(a) : null;
}

export type AuctionDetail = {
  id: string;
  card: CardView;
  sellerName: string | null;
  sellerColor: NameColorStyle | null;
  /** Commentaire du vendeur (texte brut). */
  note: string | null;
  startPrice: number;
  feeBp: number;
  fee: number | null;
  createdAt: Date;
  mine: boolean;
  live: AuctionLive;
  bids: { id: string; amount: number; createdAt: Date; bidderName: string | null; bidderColor: NameColorStyle | null; me: boolean }[];
};

export const BID_HISTORY = 20;

/** Fiche d'une vente : carte, vendeur, état en direct et dernières mises. */
export async function getAuctionDetail(id: string, viewerId: string | null, locale: string, now: Date): Promise<AuctionDetail | null> {
  const live = await auctionLive(id, viewerId, now);
  if (!live) return null;
  const a = await prisma.auction.findUnique({
    where: { id },
    select: {
      id: true,
      cardId: true,
      sellerId: true,
      startPrice: true,
      feeBp: true,
      fee: true,
      createdAt: true,
      note: true,
      seller: { select: namedPlayerSelect },
      bids: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: BID_HISTORY,
        select: { id: true, amount: true, createdAt: true, bidderId: true, bidder: { select: namedPlayerSelect } },
      },
    },
  });
  if (!a) return null;
  const [views, nameOf] = await Promise.all([
    cardViews([a.cardId], locale),
    publicNamesFor(viewerId, [a.seller, ...a.bids.map((b) => b.bidder)]),
  ]);
  const card = views.get(a.cardId);
  if (!card) return null;
  return {
    id: a.id,
    card,
    sellerName: nameOf(a.seller),
    sellerColor: shownNameColor(nameOf(a.seller), a.seller),
    note: a.note,
    startPrice: a.startPrice,
    feeBp: a.feeBp,
    fee: a.fee,
    createdAt: a.createdAt,
    mine: a.sellerId === viewerId,
    live,
    bids: a.bids.map((b) => ({ id: b.id, amount: b.amount, createdAt: b.createdAt, bidderName: nameOf(b.bidder), bidderColor: shownNameColor(nameOf(b.bidder), b.bidder), me: b.bidderId === viewerId })),
  };
}

/** Ventes ouvertes du joueur (limite affichée dans la feuille « Mettre en vente »). */
export async function activeAuctionCount(sellerId: string): Promise<number> {
  return prisma.auction.count({ where: { sellerId, status: "ACTIVE" } });
}

/** Ce que la feuille « Mettre en vente » doit savoir ; createAuctionWith revérifie tout sous verrou. */
export async function sellInfoFor(userId: string, now: Date, rarity: string) {
  const [rules, player, active] = await Promise.all([
    getMarketRules(),
    prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, bannedAt: true, createdAt: true } }),
    activeAuctionCount(userId),
  ]);
  const maxPrice = priceCap(rules, rarity);
  return {
    durationsHours: [...rules.durationsHours],
    feeBp: rules.feeBp,
    minStartPrice: rules.minStartPrice,
    maxPrice,
    /** Le plafond vient de la rareté (et non du plafond global). */
    rarityCapped: maxPrice < rules.maxPrice,
    active,
    maxActive: rules.maxActivePerSeller,
    minAccountAgeHours: rules.minAccountAgeHours,
    block: player ? checkTrader(player, now, rules) : ("BANNED" as const),
  };
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

/** Ventes ouvertes, séquestre et taxes : la santé du marché pour /admin/marche et /admin/economie. */
export async function marketTotals(now: Date) {
  const since = new Date(now.getTime() - 86_400_000);
  const [active, sold] = await Promise.all([
    prisma.auction.aggregate({ where: { status: "ACTIVE" }, _count: true, _sum: { currentBid: true } }),
    prisma.auction.aggregate({ where: { status: "SOLD", settledAt: { gte: since } }, _count: true, _sum: { fee: true, finalPrice: true } }),
  ]);
  return {
    active: active._count,
    escrow: active._sum.currentBid ?? 0,
    sold24h: sold._count,
    volume24h: sold._sum.finalPrice ?? 0,
    fees24h: sold._sum.fee ?? 0,
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
