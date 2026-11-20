import { dayKey, filterContext } from "@/lib/boosters/pool-filter";

// Cote des cartes, tirée des ventes terminées (enchères, avis de recherche remplis). La cote est la médiane
// des ventes de la fenêtre récente, avec une voix par joueur qui a fixé le prix : un vendeur qui écoule des
// dizaines de communes à un prix absurde ne pèse qu'une voix, pas des dizaines. Il faut aussi plusieurs
// joueurs différents, et la cote d'une carte est plafonnée à un multiple de la référence de sa rareté. Sans
// assez de ventes, pas de cote (null), jamais un prix inventé. Tout ici est pur : les lectures en base sont
// dans server/market/quotes.ts.

const DAY_MS = 86_400_000;

/**
 * Une vente terminée : carte, rareté actuelle de la carte, prix final, date de clôture, et le joueur qui a fixé
 * le prix (vendeur d'une enchère, acheteur d'un avis de recherche). Sans joueur connu, la vente est sa propre voix.
 */
export type Sale = { cardId: string; rarity: string; price: number; at: Date; setter?: string | null };

type Priced = Pick<Sale, "price" | "setter">;

export type QuoteRules = {
  /** Fenêtre de la cote, en jours ; la tendance la compare à la fenêtre précédente de même durée. */
  windowDays: number;
  /** Nombre minimal de ventes dans une fenêtre pour en tirer une médiane. */
  minSales: number;
  /** Nombre minimal de joueurs différents ayant fixé les prix (1 par défaut). */
  minSellers?: number;
  /** Plafond de la cote d'une carte : ce multiple de la référence de sa rareté. 0 ou absent : sans plafond. */
  capMultiplier?: number;
};

export type Quote = {
  /** Cote : médiane des ventes de la fenêtre, null s'il y en a moins de minSales. */
  price: number | null;
  /** Ventes dans la fenêtre. */
  sales: number;
  /** Médiane de la fenêtre précédente (même seuil), pour la tendance. */
  previous: number | null;
  /** Variation de la cote en points de base (+2 500 = +25 %), null sans cote actuelle et précédente. */
  changeBp: number | null;
};

/** Objets simples : passent par unstable_cache. */
export type MarketQuotes = {
  byCard: Record<string, Quote>;
  /** Référence de chaque rareté sur la fenêtre (médiane des voix, mêmes seuils), repli de la valeur de collection. */
  byRarity: Record<string, number>;
};

/** Médiane entière (moyenne arrondie des deux valeurs centrales), null pour une liste vide. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Bornes des deux fenêtres : récente ]now − w, now], précédente ]now − 2w, now − w]. */
function windows(now: Date, windowDays: number) {
  const end = now.getTime();
  const start = end - windowDays * DAY_MS;
  return { end, start, previousStart: start - windowDays * DAY_MS };
}

/**
 * Une voix par joueur : chacun pèse la médiane de ses propres ventes. Une vente sans joueur connu compte pour une
 * voix à elle seule (anciennes ventes, compte supprimé).
 */
export function setterVotes(sales: readonly Priced[]): number[] {
  const votes: number[] = [];
  const bySetter = new Map<string, number[]>();
  for (const { price, setter } of sales) {
    if (!setter) {
      votes.push(price);
      continue;
    }
    const prices = bySetter.get(setter) ?? [];
    bySetter.set(setter, prices);
    prices.push(price);
  }
  for (const prices of bySetter.values()) votes.push(median(prices)!);
  return votes;
}

/** Médiane des voix, si la fenêtre a assez de ventes et assez de joueurs différents ; sinon null. */
function settle(sales: readonly Priced[], rules: QuoteRules): number | null {
  if (sales.length < rules.minSales) return null;
  const votes = setterVotes(sales);
  return votes.length >= (rules.minSellers ?? 1) ? median(votes) : null;
}

function quoteFromSales(current: readonly Priced[], previous: readonly Priced[], rules: QuoteRules, cap: number | null = null): Quote {
  const capped = (value: number | null) => (value !== null && cap !== null ? Math.min(value, cap) : value);
  const price = capped(settle(current, rules));
  const before = capped(settle(previous, rules));
  const changeBp = price !== null && before !== null && before > 0 ? Math.round(((price - before) * 10_000) / before) : null;
  return { price, sales: current.length, previous: before, changeBp };
}

/** Cote d'un ensemble de ventes (une carte) à l'instant `now`, sans le plafond de rareté (voir buildQuotes). */
export function quoteFor(sales: readonly Pick<Sale, "price" | "at" | "setter">[], now: Date, rules: QuoteRules): Quote {
  const { end, start, previousStart } = windows(now, rules.windowDays);
  const current: Priced[] = [];
  const previous: Priced[] = [];
  for (const sale of sales) {
    const at = sale.at.getTime();
    if (at > start && at <= end) current.push(sale);
    else if (at > previousStart && at <= start) previous.push(sale);
  }
  return quoteFromSales(current, previous, rules);
}

/**
 * Cotes de toutes les cartes vendues, et référence de chaque rareté sur la fenêtre récente (médiane des voix : un
 * joueur qui vend beaucoup de cartes de la rareté n'y pèse qu'une voix). La cote d'une carte est plafonnée à
 * `capMultiplier` fois la référence de sa rareté.
 */
export function buildQuotes(sales: readonly Sale[], now: Date, rules: QuoteRules): MarketQuotes {
  const { end, start, previousStart } = windows(now, rules.windowDays);
  const cards = new Map<string, { rarity: string; current: Priced[]; previous: Priced[] }>();
  const rarities = new Map<string, Priced[]>();
  for (const sale of sales) {
    const at = sale.at.getTime();
    const recent = at > start && at <= end;
    if (!recent && !(at > previousStart && at <= start)) continue;
    const entry = cards.get(sale.cardId) ?? { rarity: sale.rarity, current: [], previous: [] };
    cards.set(sale.cardId, entry);
    (recent ? entry.current : entry.previous).push(sale);
    if (recent) {
      const prices = rarities.get(sale.rarity) ?? [];
      rarities.set(sale.rarity, prices);
      prices.push(sale);
    }
  }
  const byRarity: Record<string, number> = {};
  for (const [rarity, prices] of rarities) {
    const value = settle(prices, rules);
    if (value !== null) byRarity[rarity] = value;
  }
  const multiplier = rules.capMultiplier ?? 0;
  const byCard: Record<string, Quote> = {};
  for (const [cardId, { rarity, current, previous }] of cards) {
    const reference = byRarity[rarity];
    const cap = multiplier > 0 && reference !== undefined ? multiplier * reference : null;
    byCard[cardId] = quoteFromSales(current, previous, rules, cap);
  }
  return { byCard, byRarity };
}

/** Un jour de vente : la cote glissante à la dernière vente du jour, et le nombre de ventes du jour. */
export type PricePoint = { day: string; price: number; sales: number };
export type PriceSeries = {
  /** Jours qui ont eu des ventes (fuseau du jeu), du plus ancien au plus récent. */
  days: PricePoint[];
  /** Chaque vente de la période, du plus ancien au plus récent. */
  sales: { price: number; at: string }[];
};

/**
 * Historique d'une carte sur `historyDays` jours. La ligne suit la cote telle qu'elle était chaque jour :
 * médiane des ventes des `windowDays` jours précédant la dernière vente du jour. Comme la cote affichée,
 * elle ne saute pas pour une vente isolée hors norme ; chaque vente reste visible en point. `sales` doit
 * couvrir aussi les `windowDays` jours avant la période, pour la cote des premiers jours.
 */
export function priceSeries(
  sales: readonly Pick<Sale, "price" | "at">[],
  now: Date,
  historyDays: number,
  windowDays: number,
  timeZone: string,
): PriceSeries {
  const from = now.getTime() - historyDays * DAY_MS;
  const sorted = sales.filter((s) => s.at.getTime() <= now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  const kept = sorted.filter((s) => s.at.getTime() > from);
  const byDay = new Map<string, { last: number; count: number }>();
  for (const sale of kept) {
    const day = dayKey(filterContext(sale.at, timeZone));
    const entry = byDay.get(day) ?? { last: 0, count: 0 };
    byDay.set(day, { last: Math.max(entry.last, sale.at.getTime()), count: entry.count + 1 });
  }
  const rolling = (at: number) => median(sorted.filter((s) => s.at.getTime() > at - windowDays * DAY_MS && s.at.getTime() <= at).map((s) => s.price))!;
  return {
    days: [...byDay].map(([day, { last, count }]) => ({ day, price: rolling(last), sales: count })),
    sales: kept.map((s) => ({ price: s.price, at: s.at.toISOString() })),
  };
}

export type CollectionValue = {
  /** Valeur estimée de toute la collection, en Zeni. */
  total: number;
  /** Part venant de la cote de chaque carte. */
  fromCard: number;
  /** Part estimée par la référence de la rareté (cartes sans cote propre). */
  fromRarity: number;
  /** Exemplaires sans aucune cote, ni de carte ni de rareté : comptés pour 0. */
  unpriced: number;
};

/** Valeur d'une collection : cote de la carte, sinon médiane de sa rareté, pour chaque exemplaire. */
export function collectionValue(owned: readonly { cardId: string; rarity: string; copies: number }[], quotes: MarketQuotes): CollectionValue {
  const value: CollectionValue = { total: 0, fromCard: 0, fromRarity: 0, unpriced: 0 };
  for (const { cardId, rarity, copies } of owned) {
    const own = quotes.byCard[cardId]?.price ?? null;
    const fallback = quotes.byRarity[rarity] ?? null;
    if (own !== null) value.fromCard += own * copies;
    else if (fallback !== null) value.fromRarity += fallback * copies;
    else value.unpriced += copies;
  }
  value.total = value.fromCard + value.fromRarity;
  return value;
}

export type Mover = { cardId: string } & Quote & { price: number; changeBp: number };

/** Plus fortes hausses : cartes cotées sur les deux fenêtres, en hausse, de la plus forte à la plus faible. */
export function topMovers(quotes: MarketQuotes, limit: number): Mover[] {
  const movers: Mover[] = [];
  for (const [cardId, quote] of Object.entries(quotes.byCard)) {
    if (quote.price === null || quote.changeBp === null || quote.changeBp <= 0) continue;
    movers.push({ cardId, ...quote, price: quote.price, changeBp: quote.changeBp });
  }
  return movers
    .sort((a, b) => b.changeBp - a.changeBp || b.sales - a.sales || (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0))
    .slice(0, Math.max(0, limit));
}
