import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { SettingValue } from "@/lib/settings/defaults";
import type { Rng } from "./rng";

// Tirage d'un booster (section « Raretés et taux de drop » du plan). Logique pure : le hasard
// est injecté, la même fonction sert au serveur (crypto.randomInt), aux tests et à la simulation.

export type RarityRates = SettingValue<"booster.rates">;

export type DrawRules = {
  rates: RarityRates;
  /** Explicit order, captured with the rules; never a mutable global registry. */
  rarities?: readonly Rarity[];
  cardWeights?: Readonly<Record<string, number>>;
  slotFloors: readonly Rarity[];
  pityThreshold: number;
  goldenEvery: number;
  goldenFloor: Rarity;
  divineOdds: number;
};

/** Ids de cartes du pool, par rareté (rareté globale du catalogue). */
export type CardPool = Readonly<Record<Rarity, readonly string[]>>;

export type DrawnCard = { cardId: string; rarity: Rarity; /** Carte vedette d'une bannière. */ featured?: boolean };

export type DrawnBooster = {
  cards: DrawnCard[];
  golden: boolean;
  divine: boolean;
  /** La dernière carte a été forcée en Mythique par la pitié. */
  pityTriggered: boolean;
  /** Au moins une carte vedette (bannière). */
  featuredHit: boolean;
  /** Une carte vedette a été forcée par la pitié vedette. */
  featuredPityTriggered: boolean;
};

export const rarityIndex = (r: Rarity, order: readonly Rarity[] = RARITIES) => order.indexOf(r);

/** Raretés de `floor` à Mythique, avec leurs parts. */
export function ratesFrom(rates: RarityRates, floor: Rarity): [Rarity, number][] {
  const order = Object.keys(rates);
  return order.slice(Math.max(0, order.indexOf(floor))).map((r) => [r, rates[r] ?? 0]);
}

/** Tables cumulées par plancher, calculées une fois par tirage plutôt qu'à chaque carte. */
export type RarityTables = Record<Rarity, { total: number; bounds: [Rarity, number][] }>;

export function buildRarityTables(rates: RarityRates): RarityTables {
  return Object.fromEntries(
    Object.keys(rates).map((floor) => {
      let acc = 0;
      const bounds = ratesFrom(rates, floor).map(([r, w]): [Rarity, number] => [r, (acc += w)]);
      return [floor, { total: acc, bounds }];
    }),
  ) as RarityTables;
}

/**
 * Rareté d'un emplacement : les paliers sous le plancher sont retirés du tirage.
 * Si tous les paliers restants ont une part nulle, l'emplacement donne son plancher.
 */
export function rollRarity(rng: Rng, tables: RarityTables, floor: Rarity): Rarity {
  const { total, bounds } = tables[floor];
  if (total <= 0) return floor;
  const x = rng(total);
  for (const [rarity, bound] of bounds) if (x < bound) return rarity;
  return bounds.at(-1)![0];
}

/** Planchers d'un booster : divin (tout Épique+, dernière Mythique), doré (dernière relevée), sinon normal. */
export function floorsFor(
  slotFloors: readonly Rarity[],
  opts: { golden: boolean; divine: boolean; goldenFloor: Rarity; rarities?: readonly Rarity[] },
): Rarity[] {
  const last = slotFloors.length - 1;
  if (opts.divine) return slotFloors.map((_, i) => (i === last ? "MYTHIC" : "EPIC"));
  if (opts.golden) {
    return slotFloors.map((f, i) =>
      i === last && rarityIndex(opts.goldenFloor, opts.rarities) > rarityIndex(f, opts.rarities) ? opts.goldenFloor : f,
    );
  }
  return [...slotFloors];
}

/** Une carte de la rareté voulue ; un palier vide descend au palier inférieur, puis remonte s'il le faut. */
export function weightedPick(rng: Rng, ids: readonly string[], weights: Readonly<Record<string, number>> = {}): string | null {
  const total = ids.reduce((sum, id) => sum + (weights[id] ?? 1), 0);
  if (total <= 0) return null;
  let n = rng(total);
  for (const id of ids) { n -= weights[id] ?? 1; if (n < 0) return id; }
  return null;
}
/** Rareté réellement servie quand on tire `rarity` : même repli que pickCard (descend, puis remonte). */
export function resolvePoolRarity(pool: CardPool, rarity: Rarity, weights: Readonly<Record<string, number>> = {}, rarities: readonly Rarity[] = Object.keys(pool)): Rarity {
  const i = Math.max(0, rarities.indexOf(rarity));
  const order = [...rarities.slice(0, i + 1).reverse(), ...rarities.slice(i + 1)];
  return order.find((r) => (pool[r] ?? []).some((id) => (weights[id] ?? 1) > 0)) ?? rarity;
}
export function pickCard(rng: Rng, pool: CardPool, rarity: Rarity, weights: Readonly<Record<string, number>> = {}, rarities: readonly Rarity[] = Object.keys(pool)): DrawnCard {
  const i = Math.max(0, rarities.indexOf(rarity));
  const order = [...rarities.slice(0, i + 1).reverse(), ...rarities.slice(i + 1)];
  for (const r of order) {
    const cardId = weightedPick(rng, pool[r] ?? [], weights);
    if (cardId) return { cardId, rarity: r };
  }
  throw new Error("EMPTY_POOL");
}

export type DrawState = {
  pityCount: number;
  standardCount: number;
  /** Boosters de cette bannière ouverts depuis la dernière vedette. */
  featuredCount?: number;
};

/** Bonus applicables au type ouvert (tous actifs pour le booster standard). */
export type DrawBonuses = { golden: boolean; divine: boolean; pity: boolean };

export const ALL_BONUSES: DrawBonuses = { golden: true, divine: true, pity: true };

/** Cartes vedettes d'une bannière. */
export type FeaturedDraw = {
  /** Vedettes par rareté (rareté globale). */
  byRarity: Readonly<Record<Rarity, readonly string[]>>;
  /** Points de base (0 à 10 000) : part des tirages d'une rareté qui tombe sur une vedette de cette rareté. */
  rate: number;
  /** Vedette garantie au N-ième booster sans vedette (0 = pas de pitié vedette). */
  pityThreshold: number;
};

/** Toutes les vedettes, pour la pitié vedette (n'importe laquelle). */
function allFeatured(featured: FeaturedDraw): { cardId: string; rarity: Rarity }[] {
  return Object.keys(featured.byRarity).flatMap((r) => featured.byRarity[r].map((cardId) => ({ cardId, rarity: r })));
}

/**
 * Tire `count` boosters à la suite pour un joueur. Pour chacun, selon les bonus du type : divin
 * (1 chance sur divineOdds), doré (chaque goldenEvery-ième booster éligible), puis pitié (au
 * pityThreshold-ième booster sans Mythique, la dernière carte devient Mythique ; le compteur repart
 * à 0 à chaque Mythique). Bannière : une vedette remplace le tirage d'une rareté avec la probabilité
 * `featured.rate`, et la pitié vedette force une vedette sur l'avant-dernière carte si la pitié
 * Mythique a déjà pris la dernière.
 */
export function drawBoosters(
  rng: Rng,
  input: {
    pool: CardPool;
    rules: DrawRules;
    state: DrawState;
    count: number;
    tables?: RarityTables;
    bonuses?: DrawBonuses;
    featured?: FeaturedDraw;
  },
): { boosters: DrawnBooster[]; state: Required<DrawState> } {
  const { pool, rules, count } = input;
  const bonuses = input.bonuses ?? ALL_BONUSES;
  const order = rules.rarities ?? Object.keys(rules.rates);
  const weights = rules.cardWeights ?? {};
  const qualifies = (r: Rarity) => rarityIndex(r, order) >= rarityIndex("MYTHIC", order);
  const featured = input.featured ? { ...input.featured, byRarity: Object.fromEntries(Object.entries(input.featured.byRarity).map(([r, ids]) => [r, ids.filter((id) => (weights[id] ?? 1) > 0)])) } : undefined;
  const featuredAll = featured ? allFeatured(featured) : [];
  const featuredIds = new Set(featuredAll.map((f) => f.cardId));
  const tables = input.tables ?? buildRarityTables(rules.rates);
  let { pityCount, standardCount } = input.state;
  let featuredCount = input.state.featuredCount ?? 0;
  const boosters: DrawnBooster[] = [];

  const drawSlot = (floor: Rarity): DrawnCard => {
    // La part vedette s'applique à la rareté servie : un tirage Gold sans carte Gold retombe sur
    // Mythique et garde la chance de tomber sur la Mythique vedette.
    const rarity = resolvePoolRarity(pool, rollRarity(rng, tables, floor), weights, order);
    const candidates = featured?.byRarity[rarity] ?? [];
    if (candidates.length > 0 && rng(10_000) < featured!.rate) {
      return { cardId: weightedPick(rng, candidates, weights)!, rarity, featured: true };
    }
    const card = pickCard(rng, pool, rarity, weights, order);
    return featuredIds.has(card.cardId) ? { ...card, featured: true } : card;
  };

  for (let b = 0; b < count; b++) {
    const divine = bonuses.divine && rules.divineOdds > 0 && rng(rules.divineOdds) === 0;
    const golden = bonuses.golden && rules.goldenEvery > 0 && (standardCount + 1) % rules.goldenEvery === 0;
    if (bonuses.golden) standardCount += 1;

    const floors = floorsFor(rules.slotFloors, { golden, divine, goldenFloor: rules.goldenFloor, rarities: order });
    const cards = floors.map(drawSlot);

    const pity = pityCount + 1;
    let pityTriggered = false;
    if (bonuses.pity && pity >= rules.pityThreshold && !cards.some((c) => qualifies(c.rarity))) {
      cards[cards.length - 1] = pickCard(rng, pool, "MYTHIC", weights, order);
      pityTriggered = true;
    }

    let featuredPityTriggered = false;
    if (featured && featuredAll.length > 0) {
      const sinceFeatured = featuredCount + 1;
      if (featured.pityThreshold > 0 && sinceFeatured >= featured.pityThreshold && !cards.some((c) => c.featured)) {
        const slot = pityTriggered ? Math.max(0, cards.length - 2) : cards.length - 1;
        const chosen = weightedPick(rng, featuredAll.map((c) => c.cardId), weights)!;
        cards[slot] = { ...featuredAll.find((c) => c.cardId === chosen)!, featured: true };
        featuredPityTriggered = true;
      }
      featuredCount = cards.some((c) => c.featured) ? 0 : sinceFeatured;
    }

    if (bonuses.pity) pityCount = cards.some((c) => qualifies(c.rarity)) ? 0 : pity;
    boosters.push({
      cards,
      golden,
      divine,
      pityTriggered,
      featuredHit: cards.some((c) => c.featured === true),
      featuredPityTriggered,
    });
  }

  return { boosters, state: { pityCount, standardCount, featuredCount } };
}

/** Boosters restants avant le prochain doré (1 = le prochain), null si désactivé. */
export function boostersUntilGolden(standardCount: number, goldenEvery: number): number | null {
  if (goldenEvery <= 0) return null;
  return goldenEvery - (standardCount % goldenEvery);
}

/** Boosters restants avant la Mythique garantie (1 = le prochain est garanti). */
export function boostersUntilPity(pityCount: number, pityThreshold: number): number {
  return Math.max(1, pityThreshold - pityCount);
}

/** Pool regroupé par rareté à partir de cartes { id, rarity }. */
export function groupByRarity(cards: Iterable<{ id: string; rarity: Rarity }>): CardPool {
  const pool = Object.fromEntries(RARITIES.map((r) => [r, [] as string[]])) as Record<Rarity, string[]>;
  for (const c of cards) (pool[c.rarity] ??= []).push(c.id);
  return pool;
}

/** Nombre de cartes par rareté d'un pool. */
export function poolCounts(pool: CardPool): Record<Rarity, number> {
  return Object.fromEntries(Object.keys(pool).map((r) => [r, pool[r].length])) as Record<Rarity, number>;
}

export function poolSize(pool: CardPool): number {
  return Object.values(pool).reduce((sum, ids) => sum + ids.length, 0);
}

/** Vedettes d'une bannière, rangées par rareté d'après le pool (une vedette hors pool est ignorée). */
export function featuredFromPool(
  featuredIds: readonly string[],
  pool: CardPool,
  opts: { rate: number; pityThreshold: number },
): FeaturedDraw | undefined {
  if (featuredIds.length === 0) return undefined;
  const wanted = new Set(featuredIds);
  const byRarity = Object.fromEntries(Object.keys(pool).map((r) => [r, pool[r].filter((id) => wanted.has(id))])) as Record<
    Rarity,
    string[]
  >;
  if (Object.values(byRarity).every((ids) => ids.length === 0)) return undefined;
  return { byRarity, rate: opts.rate, pityThreshold: opts.pityThreshold };
}
