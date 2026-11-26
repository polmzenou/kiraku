import "server-only";
import { unstable_cache } from "next/cache";
import { buildQuotes, collectionValue, priceSeries, quoteFor, topMovers, type CollectionValue, type MarketQuotes, type Quote, type QuoteRules } from "@/lib/market/quotes";
import { getCatalogSummaries, type CatalogCardSummary } from "../catalog/queries";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Cote des cartes, lue depuis les ventes terminées : enchères (Auction SOLD) et avis de recherche remplis
// (BuyOrder FILLED). Aucune table de plus,
// rien à tenir à jour à la clôture. Les cotes sont partagées par tous les joueurs et gardées 5 minutes ;
// la valeur d'une collection (données du joueur) ne passe pas par le cache.

const CACHE_SECONDS = 300;
const DAY_MS = 86_400_000;
/** Garde-fou : au-delà, les ventes les plus anciennes de la période sont ignorées. */
const MAX_SALES = 50_000;

type FullQuoteRules = Required<QuoteRules>;

async function quoteRules(): Promise<FullQuoteRules> {
  const [windowDays, minSales, minSellers, capMultiplier] = await Promise.all([
    getSetting("market.quoteWindowDays"),
    getSetting("market.quoteMinSales"),
    getSetting("market.quoteMinSellers"),
    getSetting("market.quoteCapMultiplier"),
  ]);
  return { windowDays, minSales, minSellers, capMultiplier };
}

// Les réglages font partie de la clé : un réglage modifié dans l'admin donne de nouvelles cotes. Le prix d'une
// enchère est fixé par son vendeur, celui d'un avis de recherche par son acheteur : c'est leur voix qui compte.
const loadQuotes = unstable_cache(
  async (windowDays: number, minSales: number, minSellers: number, capMultiplier: number): Promise<MarketQuotes> => {
    const now = new Date();
    const since = new Date(now.getTime() - 2 * windowDays * DAY_MS);
    const [auctions, orders] = await Promise.all([
      prisma.auction.findMany({
        where: { status: "SOLD", finalPrice: { not: null }, settledAt: { gt: since } },
        orderBy: { settledAt: "desc" },
        take: MAX_SALES,
        select: { cardId: true, finalPrice: true, settledAt: true, sellerId: true, card: { select: { rarity: true } } },
      }),
      prisma.buyOrder.findMany({
        where: { status: "FILLED", filledAt: { gt: since } },
        orderBy: { filledAt: "desc" },
        take: MAX_SALES,
        select: { cardId: true, price: true, filledAt: true, buyerId: true, card: { select: { rarity: true } } },
      }),
    ]);
    const sales = [
      ...auctions.flatMap((r) => (r.finalPrice !== null && r.settledAt ? [{ cardId: r.cardId, rarity: r.card.rarity, price: r.finalPrice, at: r.settledAt, setter: r.sellerId }] : [])),
      ...orders.flatMap((r) => (r.filledAt ? [{ cardId: r.cardId, rarity: r.card.rarity, price: r.price, at: r.filledAt, setter: r.buyerId }] : [])),
    ];
    return buildQuotes(sales, now, { windowDays, minSales, minSellers, capMultiplier });
  },
  ["market-quotes-v3"],
  { revalidate: CACHE_SECONDS, tags: ["market-quotes"] },
);

/** Cotes de toutes les cartes vendues récemment, et référence de chaque rareté. */
export async function getMarketQuotes(): Promise<MarketQuotes> {
  const { windowDays, minSales, minSellers, capMultiplier } = await quoteRules();
  return loadQuotes(windowDays, minSales, minSellers, capMultiplier);
}

export type CardPriceHistory = {
  quote: Quote;
  rules: QuoteRules;
  historyDays: number;
  series: ReturnType<typeof priceSeries>;
};

const loadHistory = unstable_cache(
  async (cardId: string, windowDays: number, minSales: number, minSellers: number, historyDays: number, timeZone: string): Promise<CardPriceHistory> => {
    const now = new Date();
    // La cote demande deux fenêtres (tendance) ; la courbe, historyDays plus une fenêtre (cote des premiers jours)
    const since = new Date(now.getTime() - (Math.max(historyDays, windowDays) + windowDays) * DAY_MS);
    const [auctions, orders] = await Promise.all([
      prisma.auction.findMany({
        where: { cardId, status: "SOLD", finalPrice: { not: null }, settledAt: { gt: since } },
        orderBy: { settledAt: "asc" },
        take: MAX_SALES,
        select: { finalPrice: true, settledAt: true, sellerId: true },
      }),
      prisma.buyOrder.findMany({
        where: { cardId, status: "FILLED", filledAt: { gt: since } },
        orderBy: { filledAt: "asc" },
        take: MAX_SALES,
        select: { price: true, filledAt: true, buyerId: true },
      }),
    ]);
    const sales = [
      ...auctions.flatMap((r) => (r.finalPrice !== null && r.settledAt ? [{ price: r.finalPrice, at: r.settledAt, setter: r.sellerId }] : [])),
      ...orders.flatMap((r) => (r.filledAt ? [{ price: r.price, at: r.filledAt, setter: r.buyerId }] : [])),
    ];
    const rules = { windowDays, minSales, minSellers };
    return { quote: quoteFor(sales, now, rules), rules, historyDays, series: priceSeries(sales, now, historyDays, windowDays, timeZone) };
  },
  // v4 : la courbe compte une voix par joueur (lib/market/quotes.ts, priceSeries)
  ["market-card-history-v4"],
  { revalidate: CACHE_SECONDS, tags: ["market-quotes"] },
);

/**
 * Cote, tendance et courbe des ventes d'une carte (fiche carte). La cote affichée est celle du marché, plafonnée par
 * la référence de la rareté, pour que la fiche, la valeur de collection et les avis de recherche disent le même prix.
 */
export async function getCardPriceHistory(cardId: string): Promise<CardPriceHistory> {
  const [{ windowDays, minSales, minSellers }, historyDays, timeZone, quotes] = await Promise.all([
    quoteRules(), getSetting("market.quoteHistoryDays"), getSetting("game.timeZone"), getMarketQuotes(),
  ]);
  const history = await loadHistory(cardId, windowDays, minSales, minSellers, historyDays, timeZone);
  return { ...history, quote: quotes.byCard[cardId] ?? history.quote };
}

/** Valeur estimée de la collection d'un joueur : cote de chaque carte, sinon référence de sa rareté. */
export async function getCollectionValue(ownerId: string): Promise<CollectionValue> {
  const [owned, quotes] = await Promise.all([
    prisma.$queryRaw<{ cardId: string; rarity: string; copies: number }[]>`
      SELECT c.id AS "cardId", c."rarityKey" AS rarity, COUNT(*)::int AS copies
      FROM "UserCard" uc
      JOIN "Card" c ON c.id = uc."cardId"
      WHERE uc."ownerId" = ${ownerId}
      GROUP BY c.id`,
    getMarketQuotes(),
  ]);
  return collectionValue(owned, quotes);
}

export type MoverCard = { card: CatalogCardSummary; price: number; changeBp: number; sales: number };

/** Plus fortes hausses de la cote, avec la fiche publique de chaque carte (cartes publiées seulement). */
export async function getTopMovers(limit = 6): Promise<MoverCard[]> {
  const quotes = await getMarketQuotes();
  // Un peu plus que demandé : une carte sortie du catalogue n'a plus de fiche publique et saute
  const movers = topMovers(quotes, limit * 2);
  if (movers.length === 0) return [];
  const cards = await prisma.card.findMany({ where: { id: { in: movers.map((m) => m.cardId) }, status: "PUBLISHED" }, select: { id: true, publicId: true } });
  const publicIds = new Map(cards.map((c) => [c.id, c.publicId]));
  const summaries = new Map((await getCatalogSummaries([...publicIds.values()])).map((s) => [s.anilistId, s]));
  return movers.flatMap((m) => {
    const card = summaries.get(publicIds.get(m.cardId) ?? -1);
    return card ? [{ card, price: m.price, changeBp: m.changeBp, sales: m.sales }] : [];
  }).slice(0, limit);
}
