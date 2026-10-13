import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { SettingValue } from "@/lib/settings/defaults";
import type { Rng } from "./rng";

// Tirage d'un booster (section « Raretés et taux de drop » du plan). Logique pure : le hasard
// est injecté, la même fonction sert au serveur (crypto.randomInt), aux tests et à la simulation.

export type RarityRates = SettingValue<"booster.rates">;

export type DrawRules = {
  rates: RarityRates;
  slotFloors: readonly Rarity[];
  pityThreshold: number;
  goldenEvery: number;
  goldenFloor: Rarity;
  divineOdds: number;
};

/** Ids de cartes du pool, par rareté (rareté globale du catalogue). */
export type CardPool = Readonly<Record<Rarity, readonly string[]>>;

export type DrawnCard = { cardId: string; rarity: Rarity };

export type DrawnBooster = {
  cards: DrawnCard[];
  golden: boolean;
  divine: boolean;
  /** La dernière carte a été forcée en Mythique par la pitié. */
  pityTriggered: boolean;
};

export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);

/** Raretés de `floor` à Mythique, avec leurs parts. */
export function ratesFrom(rates: RarityRates, floor: Rarity): [Rarity, number][] {
  return RARITIES.slice(rarityIndex(floor)).map((r) => [r, rates[r]]);
}

/** Tables cumulées par plancher, calculées une fois par tirage plutôt qu'à chaque carte. */
export type RarityTables = Record<Rarity, { total: number; bounds: [Rarity, number][] }>;

export function buildRarityTables(rates: RarityRates): RarityTables {
  return Object.fromEntries(
    RARITIES.map((floor) => {
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
  opts: { golden: boolean; divine: boolean; goldenFloor: Rarity },
): Rarity[] {
  const last = slotFloors.length - 1;
  if (opts.divine) return slotFloors.map((_, i) => (i === last ? "MYTHIC" : "EPIC"));
  if (opts.golden) {
    return slotFloors.map((f, i) =>
      i === last && rarityIndex(opts.goldenFloor) > rarityIndex(f) ? opts.goldenFloor : f,
    );
  }
  return [...slotFloors];
}

/** Une carte de la rareté voulue ; un palier vide descend au palier inférieur, puis remonte s'il le faut. */
export function pickCard(rng: Rng, pool: CardPool, rarity: Rarity): DrawnCard {
  const i = rarityIndex(rarity);
  const order = [...RARITIES.slice(0, i + 1).reverse(), ...RARITIES.slice(i + 1)];
  for (const r of order) {
    const ids = pool[r];
    if (ids.length > 0) return { cardId: ids[rng(ids.length)], rarity: r };
  }
  throw new Error("EMPTY_POOL");
}

export type DrawState = { pityCount: number; standardCount: number };

/**
 * Tire `count` boosters gratuits à la suite pour un joueur. Pour chacun : divin (1 chance sur
 * divineOdds), doré (chaque goldenEvery-ième), puis pitié (au pityThreshold-ième booster sans
 * Mythique, la dernière carte devient Mythique ; le compteur repart à 0 à chaque Mythique).
 */
export function drawBoosters(
  rng: Rng,
  input: { pool: CardPool; rules: DrawRules; state: DrawState; count: number; tables?: RarityTables },
): { boosters: DrawnBooster[]; state: DrawState } {
  const { pool, rules, count } = input;
  const tables = input.tables ?? buildRarityTables(rules.rates);
  let { pityCount, standardCount } = input.state;
  const boosters: DrawnBooster[] = [];

  for (let b = 0; b < count; b++) {
    const divine = rules.divineOdds > 0 && rng(rules.divineOdds) === 0;
    const golden = rules.goldenEvery > 0 && (standardCount + 1) % rules.goldenEvery === 0;
    standardCount += 1;

    const floors = floorsFor(rules.slotFloors, { golden, divine, goldenFloor: rules.goldenFloor });
    const cards = floors.map((floor) => pickCard(rng, pool, rollRarity(rng, tables, floor)));

    const pity = pityCount + 1;
    let pityTriggered = false;
    if (pity >= rules.pityThreshold && !cards.some((c) => c.rarity === "MYTHIC")) {
      cards[cards.length - 1] = pickCard(rng, pool, "MYTHIC");
      pityTriggered = true;
    }
    pityCount = cards.some((c) => c.rarity === "MYTHIC") ? 0 : pity;
    boosters.push({ cards, golden, divine, pityTriggered });
  }

  return { boosters, state: { pityCount, standardCount } };
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
