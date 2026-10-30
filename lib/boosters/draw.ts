import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { SettingValue } from "@/lib/settings/defaults";
import type { Rng } from "./rng";

// Tirage d'un booster (section « Raretés et taux de drop » du plan). Logique pure : le hasard
// est injecté, la même fonction sert au serveur (crypto.randomInt), aux tests et à la simulation.

export type RarityRates = SettingValue<"booster.rates">;

/** Poids des cartes : la table du catalogue (1 par défaut, 0 = exclue), ou une fonction (doublons). */
export type CardWeights = Readonly<Record<string, number>> | ((cardId: string) => number);
const weightOf = (weights: CardWeights, id: string) => (typeof weights === "function" ? weights(id) : (weights[id] ?? 1));

/**
 * Doublons des grandes raretés : une carte d'une rareté protégée déjà possédée n'a plus qu'une chance
 * sur `divisor` de ses chances normales, et plus aucune à partir de `blockAt` exemplaires (0 = jamais).
 */
export type DuplicateGuard = { rarities: readonly Rarity[]; divisor: number; blockAt: number };
/** Exemplaires déjà possédés par le joueur, par carte (seules les raretés protégées comptent). */
export type OwnedCopies = ReadonlyMap<string, number>;

export type DrawRules = {
  rates: RarityRates;
  /** Explicit order, captured with the rules; never a mutable global registry. */
  rarities?: readonly Rarity[];
  cardWeights?: Readonly<Record<string, number>>;
  duplicateGuard?: DuplicateGuard;
  slotFloors: readonly Rarity[];
  pityThreshold: number;
  goldenEvery: number;
  goldenFloor: Rarity;
  /** Chute d'un sachet Divin : 1 chance sur N (0 = jamais). */
  divineOdds: number;
  /** Chute d'un sachet Apocalyptique : 1 chance sur N (0 = jamais). */
  apocalypseOdds: number;
  /** Apocalyptique épargné, en points de base. */
  apocalypseWinRate: number;
  /** Apocalyptiques ruinés d'affilée avant une épargne forcée (0 = pas de karma). */
  apocalypseKarma: number;
};

/** Sachets scellés : tombent d'un booster gratuit, s'ouvrent plus tard. */
export const SEALED_KINDS = ["divin", "apocalypse"] as const;
export type SealedKind = (typeof SEALED_KINDS)[number];

/** Ids de cartes du pool, par rareté (rareté globale du catalogue). */
export type CardPool = Readonly<Record<Rarity, readonly string[]>>;

export type DrawnCard = { cardId: string; rarity: Rarity; /** Carte vedette d'une bannière. */ featured?: boolean };

export type DrawnBooster = {
  /** Vide quand le booster s'est transformé en sachet scellé. */
  cards: DrawnCard[];
  golden: boolean;
  /** Sachet scellé tombé à la place des cartes. */
  drop: SealedKind | null;
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

const BP = 10_000;

/**
 * Taux d'un type boosté (Impérial) : la part de chaque rareté à partir de `from` est multipliée par
 * factorBp / 10 000, et la masse ajoutée est reprise aux autres raretés au prorata (total inchangé).
 * Poids mis à l'échelle × 10 000 pour rester entiers (rng(total)). Sans boost (`from` null ou absent
 * de l'ordre, facteur de 10 000), les taux reviennent tels quels.
 */
export function boostRates(rates: RarityRates, from: Rarity | null, factorBp: number, order: readonly Rarity[] = Object.keys(rates)): RarityRates {
  const start = from ? order.indexOf(from) : -1;
  if (start < 0 || factorBp === BP) return rates;
  const keys = Object.keys(rates);
  const boosted = (r: Rarity) => order.indexOf(r) >= start;
  const total = keys.reduce((sum, r) => sum + (rates[r] ?? 0), 0);
  const raised = keys.reduce((sum, r) => sum + (boosted(r) ? (rates[r] ?? 0) : 0), 0);
  const rest = total - raised;
  // Ce qui reste aux raretés non boostées ; jamais négatif si le boost dépasse tout le reste
  const scale = rest > 0 ? Math.max(0, total - (raised * factorBp) / BP) / rest : 0;
  return Object.fromEntries(
    keys.map((r) => [r, boosted(r) ? (rates[r] ?? 0) * factorBp : Math.round((rates[r] ?? 0) * BP * scale)]),
  ) as RarityRates;
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
export function weightedPick(rng: Rng, ids: readonly string[], weights: CardWeights = {}): string | null {
  const total = ids.reduce((sum, id) => sum + weightOf(weights, id), 0);
  if (total <= 0) return null;
  let n = rng(total);
  for (const id of ids) { n -= weightOf(weights, id); if (n < 0) return id; }
  return null;
}
/** Rareté réellement servie quand on tire `rarity` : même repli que pickCard (descend, puis remonte). */
export function resolvePoolRarity(pool: CardPool, rarity: Rarity, weights: CardWeights = {}, rarities: readonly Rarity[] = Object.keys(pool)): Rarity {
  const i = Math.max(0, rarities.indexOf(rarity));
  const order = [...rarities.slice(0, i + 1).reverse(), ...rarities.slice(i + 1)];
  return order.find((r) => (pool[r] ?? []).some((id) => weightOf(weights, id) > 0)) ?? rarity;
}

/** Exemplaires suivis pendant un tirage : chaque carte tirée compte tout de suite (plusieurs boosters, lots). */
export type GuardState = {
  /** Poids de la carte, 0 quand elle est bloquée. */
  weight: (cardId: string) => number;
  /** Carte protégée déjà possédée (et pas encore bloquée). */
  owned: (cardId: string) => boolean;
  /** Une carte déjà possédée est gardée : une chance sur `divisor`. */
  accept: (rng: Rng) => boolean;
  take: (cardId: string) => void;
  /** Carte remplacée avant d'être donnée (pitié, pitié vedette). */
  release: (cardId: string) => void;
};

/** Suivi des doublons d'un tirage ; null quand aucune rareté protégée n'a de carte dans le pool. */
export function guardState(guard: DuplicateGuard | undefined, owned: OwnedCopies | undefined, pool: CardPool, weights: CardWeights = {}): GuardState | null {
  if (!guard || guard.rarities.length === 0) return null;
  const guarded = new Set(guard.rarities.flatMap((r) => pool[r] ?? []));
  if (guarded.size === 0) return null;
  const copies = new Map(owned ?? []);
  const count = (id: string) => (guarded.has(id) ? (copies.get(id) ?? 0) : 0);
  const blocked = (id: string) => guard.blockAt > 0 && count(id) >= guard.blockAt;
  return {
    weight: (id) => (blocked(id) ? 0 : weightOf(weights, id)),
    owned: (id) => count(id) > 0 && !blocked(id),
    accept: (rng) => guard.divisor <= 1 || rng(guard.divisor) === 0,
    take: (id) => void (guarded.has(id) && copies.set(id, count(id) + 1)),
    release: (id) => void (guarded.has(id) && copies.set(id, Math.max(0, count(id) - 1))),
  };
}

/**
 * Une carte parmi `ids` en deux temps : une carte déjà possédée n'est gardée qu'avec une chance sur N,
 * sinon une carte jamais possédée du même lot. Ses chances valent donc toujours ses chances normales
 * divisées par N, même quand tout le lot est déjà possédé (null : rien à donner dans ce lot).
 */
function pickFresh(rng: Rng, ids: readonly string[], weights: CardWeights, guard: GuardState | null): string | null {
  const id = weightedPick(rng, ids, weights);
  if (!id || !guard?.owned(id) || guard.accept(rng)) return id;
  return weightedPick(rng, ids, (x) => (guard.owned(x) ? 0 : weightOf(weights, x)));
}

/** Carte de la rareté voulue (doublons compris avec `guard`) : sinon la rareté du dessous, puis celle du dessus. */
export function pickCard(rng: Rng, pool: CardPool, rarity: Rarity, weights: CardWeights = {}, rarities: readonly Rarity[] = Object.keys(pool), guard: GuardState | null = null): DrawnCard {
  const i = Math.max(0, rarities.indexOf(rarity));
  const order = [...rarities.slice(0, i + 1).reverse(), ...rarities.slice(i + 1)];
  for (const r of order) {
    const cardId = pickFresh(rng, pool[r] ?? [], guard?.weight ?? weights, guard);
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

/** Bonus applicables au type ouvert (tous actifs pour le booster standard). `drop` : sachets scellés. */
export type DrawBonuses = { golden: boolean; drop: boolean; pity: boolean };

export const ALL_BONUSES: DrawBonuses = { golden: true, drop: true, pity: true };

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
 * Tire `count` boosters à la suite pour un joueur. Pour chacun, selon les bonus du type : doré
 * (chaque goldenEvery-ième booster éligible), sinon chute d'un sachet scellé (Divin 1 chance sur
 * divineOdds, sinon Apocalyptique 1 sur apocalypseOdds : le booster n'a pas de cartes et ne fait
 * avancer aucun compteur), puis pitié (au pityThreshold-ième booster sans Mythique, la dernière carte
 * devient Mythique ; le compteur repart à 0 à chaque Mythique). Bannière : une vedette remplace le tirage d'une rareté avec la probabilité
 * `featured.rate`, et la pitié vedette force une vedette sur l'avant-dernière carte si la pitié
 * Mythique a déjà pris la dernière. Doublons (`rules.duplicateGuard`, `owned`) : chaque carte tirée
 * compte tout de suite, vedettes et pitiés comprises ; une carte bloquée ne sort plus, et une rareté
 * entièrement bloquée retombe sur la rareté du dessous.
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
    owned?: OwnedCopies;
  },
): { boosters: DrawnBooster[]; state: Required<DrawState> } {
  const { pool, rules, count } = input;
  const bonuses = input.bonuses ?? ALL_BONUSES;
  const order = rules.rarities ?? Object.keys(rules.rates);
  const weights = rules.cardWeights ?? {};
  const guard = guardState(rules.duplicateGuard, input.owned, pool, weights);
  // Poids en vigueur : ceux du catalogue, à 0 pour une carte bloquée
  const w: CardWeights = guard?.weight ?? weights;
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
    const rarity = resolvePoolRarity(pool, rollRarity(rng, tables, floor), w, order);
    const candidates = featured?.byRarity[rarity] ?? [];
    if (candidates.length > 0 && rng(10_000) < featured!.rate) {
      // Vedette déjà possédée et refusée, ou toutes bloquées : le tirage ordinaire de la rareté reprend
      const cardId = pickFresh(rng, candidates, w, guard);
      if (cardId) return { cardId, rarity, featured: true };
    }
    const card = pickCard(rng, pool, rarity, w, order, guard);
    return featuredIds.has(card.cardId) ? { ...card, featured: true } : card;
  };
  // Chaque carte tirée compte tout de suite pour les emplacements et les boosters suivants
  const drawCounted = (floor: Rarity): DrawnCard => {
    const card = drawSlot(floor);
    guard?.take(card.cardId);
    return card;
  };
  const replace = (cards: DrawnCard[], slot: number, card: DrawnCard) => {
    guard?.release(cards[slot].cardId);
    guard?.take(card.cardId);
    cards[slot] = card;
  };

  for (let b = 0; b < count; b++) {
    const golden = bonuses.golden && rules.goldenEvery > 0 && (standardCount + 1) % rules.goldenEvery === 0;
    // Un booster doré ne se transforme jamais ; un booster transformé ne compte pour rien
    const drop = golden || !bonuses.drop ? null : rollDrop(rng, rules);
    if (drop) {
      boosters.push({ cards: [], golden: false, drop, pityTriggered: false, featuredHit: false, featuredPityTriggered: false });
      continue;
    }
    if (bonuses.golden) standardCount += 1;

    const floors = floorsFor(rules.slotFloors, { golden, divine: false, goldenFloor: rules.goldenFloor, rarities: order });
    const cards = floors.map(drawCounted);

    const pity = pityCount + 1;
    let pityTriggered = false;
    if (bonuses.pity && pity >= rules.pityThreshold && !cards.some((c) => qualifies(c.rarity))) {
      // Toutes les Mythiques bloquées : la pitié retombe en Légendaire, et son compteur continue
      replace(cards, cards.length - 1, pickCard(rng, pool, "MYTHIC", w, order, guard));
      pityTriggered = true;
    }

    let featuredPityTriggered = false;
    if (featured && featuredAll.length > 0) {
      const sinceFeatured = featuredCount + 1;
      if (featured.pityThreshold > 0 && sinceFeatured >= featured.pityThreshold && !cards.some((c) => c.featured)) {
        // Jamais une vedette déjà possédée, sauf la même chance sur N : la pitié vedette attend alors
        const chosen = pickFresh(rng, featuredAll.map((c) => c.cardId), w, guard);
        if (chosen) {
          const slot = pityTriggered ? Math.max(0, cards.length - 2) : cards.length - 1;
          replace(cards, slot, { ...featuredAll.find((c) => c.cardId === chosen)!, featured: true });
          featuredPityTriggered = true;
        }
      }
      featuredCount = cards.some((c) => c.featured) ? 0 : sinceFeatured;
    }

    if (bonuses.pity) pityCount = cards.some((c) => qualifies(c.rarity)) ? 0 : pity;
    boosters.push({
      cards,
      golden,
      drop: null,
      pityTriggered,
      featuredHit: cards.some((c) => c.featured === true),
      featuredPityTriggered,
    });
  }

  return { boosters, state: { pityCount, standardCount, featuredCount } };
}

/** Sachet scellé tombé d'un booster : Divin d'abord, sinon Apocalyptique (jamais les deux). */
export function rollDrop(rng: Rng, rules: Pick<DrawRules, "divineOdds" | "apocalypseOdds">): SealedKind | null {
  if (rules.divineOdds > 0 && rng(rules.divineOdds) === 0) return "divin";
  if (rules.apocalypseOdds > 0 && rng(rules.apocalypseOdds) === 0) return "apocalypse";
  return null;
}

/** Parts sans les raretés au-dessus de `ceiling` (Apocalyptique ruiné, plafonné à Peu commune). */
export function capRates(rates: RarityRates, ceiling: Rarity): RarityRates {
  const order = Object.keys(rates);
  const max = order.indexOf(ceiling);
  if (max < 0) return { ...rates };
  return Object.fromEntries(order.map((r, i) => [r, i > max ? 0 : rates[r]])) as RarityRates;
}

export type ApocalypseOutcome = "SPARED" | "RUINED";

/** Apocalyptique ruiné : planchers de chaque emplacement et rareté maximale. */
export type RuinRules = { floors: readonly Rarity[]; ceiling: Rarity };

/**
 * Ouvre un sachet scellé. Divin : planchers de l'ancien booster divin (tout Épique ou mieux, dernière
 * carte Mythique ou mieux). Apocalyptique : épargné avec la probabilité apocalypseWinRate, ou
 * forcément quand le karma atteint apocalypseKarma (contenu d'un Divin, karma remis à 0) ; sinon
 * ruiné (planchers et plafond de ruine, karma + 1). Ni pitié, ni doré, ni vedette. Doublons des
 * grandes raretés comme pour un booster (`owned`).
 */
export function drawSealed(
  rng: Rng,
  input: { kind: SealedKind; pool: CardPool; rules: DrawRules; ruin: RuinRules; karma: number; tables?: RarityTables; owned?: OwnedCopies },
): { cards: DrawnCard[]; outcome: ApocalypseOutcome | null; karma: number } {
  const { pool, rules, ruin } = input;
  const order = rules.rarities ?? Object.keys(rules.rates);
  const weights = rules.cardWeights ?? {};
  const guard = guardState(rules.duplicateGuard, input.owned, pool, weights);
  const w: CardWeights = guard?.weight ?? weights;
  const draw = (source: CardPool, floors: readonly Rarity[], tables: RarityTables) =>
    floors.map((floor) => {
      const card = pickCard(rng, source, resolvePoolRarity(source, rollRarity(rng, tables, floor), w, order), w, order, guard);
      guard?.take(card.cardId);
      return card;
    });
  const divine = () =>
    draw(pool, floorsFor(rules.slotFloors, { golden: false, divine: true, goldenFloor: rules.goldenFloor, rarities: order }), input.tables ?? buildRarityTables(rules.rates));

  if (input.kind === "divin") return { cards: divine(), outcome: null, karma: input.karma };

  const forced = rules.apocalypseKarma > 0 && input.karma >= rules.apocalypseKarma;
  if (forced || rng(10_000) < rules.apocalypseWinRate) return { cards: divine(), outcome: "SPARED", karma: 0 };

  // Pool plafonné aussi : un palier vide ne doit pas faire remonter au-dessus de la ruine
  const max = order.indexOf(ruin.ceiling);
  const capped = (max < 0 ? pool : Object.fromEntries(order.map((r, i) => [r, i > max ? [] : (pool[r] ?? [])]))) as CardPool;
  return { cards: draw(capped, ruin.floors, buildRarityTables(capRates(rules.rates, ruin.ceiling))), outcome: "RUINED", karma: input.karma + 1 };
}

/** Part d'Apocalyptiques épargnés sur le long terme, karma compris : 1 / Σ_{j=0..K} (1 − p)^j. */
export function apocalypseSparedShare(winRate: number, karma: number): number {
  const p = Math.min(Math.max(winRate, 0), 10_000) / 10_000;
  if (karma <= 0) return p;
  let cycle = 0;
  for (let j = 0; j <= karma; j++) cycle += (1 - p) ** j;
  return 1 / cycle;
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
