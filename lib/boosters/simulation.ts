import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { buildRarityTables, drawBoosters, rarityIndex, type CardPool, type DrawRules } from "./draw";
import { atLeastOdds, longRunMythicRate, slotDistribution } from "./odds";
import type { Rng } from "./rng";

// Simulation de millions de boosters, comparée aux probabilités exactes d'odds.ts.
// Utilisée par simulation.test.ts et par `npm run sim:boosters`.

export type SimulationCounts = {
  boosters: number;
  /** Rareté obtenue par emplacement (hors doré, divin et pitié). */
  perSlot: Record<Rarity, number>[];
  /** Boosters normaux contenant au moins une carte ≥ R. */
  atLeast: Record<Rarity, number>;
  normalBoosters: number;
  mythicBoosters: number;
  golden: number;
  divine: number;
  pityTriggered: number;
  /** Plus longue série de boosters sans Mythique. */
  longestDrought: number;
  /** Boosters dorés dont la dernière carte est sous le plancher doré (doit rester à 0). */
  goldenBelowFloor: number;
  /** Boosters dorés mal placés (doit rester à 0). */
  goldenMisplaced: number;
};

const zero = () => Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;

export function simulate(rng: Rng, rules: DrawRules, pool: CardPool, boosters: number): SimulationCounts {
  const tables = buildRarityTables(rules.rates);
  const counts: SimulationCounts = {
    boosters,
    perSlot: rules.slotFloors.map(zero),
    atLeast: zero(),
    normalBoosters: 0,
    mythicBoosters: 0,
    golden: 0,
    divine: 0,
    pityTriggered: 0,
    longestDrought: 0,
    goldenBelowFloor: 0,
    goldenMisplaced: 0,
  };
  let state = { pityCount: 0, standardCount: 0 };
  let drought = 0;
  const chunk = 10_000;

  for (let done = 0; done < boosters; done += chunk) {
    const count = Math.min(chunk, boosters - done);
    const startCount = state.standardCount;
    const result = drawBoosters(rng, { pool, rules, state, count, tables });
    state = result.state;

    result.boosters.forEach((b, i) => {
      const hasMythic = b.cards.some((c) => c.rarity === "MYTHIC");
      if (hasMythic) {
        counts.mythicBoosters += 1;
        drought = 0;
      } else {
        drought += 1;
        counts.longestDrought = Math.max(counts.longestDrought, drought);
      }
      if (b.divine) counts.divine += 1;
      if (b.pityTriggered) counts.pityTriggered += 1;
      if (b.golden) {
        counts.golden += 1;
        if (rarityIndex(b.cards.at(-1)!.rarity) < rarityIndex(rules.goldenFloor)) counts.goldenBelowFloor += 1;
      }
      const shouldBeGolden = rules.goldenEvery > 0 && (startCount + i + 1) % rules.goldenEvery === 0;
      if (b.golden !== shouldBeGolden) counts.goldenMisplaced += 1;

      if (b.golden || b.divine || b.pityTriggered) return;
      counts.normalBoosters += 1;
      b.cards.forEach((c, slot) => (counts.perSlot[slot][c.rarity] += 1));
      const best = Math.max(...b.cards.map((c) => rarityIndex(c.rarity)));
      for (const r of RARITIES) if (rarityIndex(r) <= best) counts.atLeast[r] += 1;
    });
  }
  return counts;
}

export type Check = {
  label: string;
  expected: number;
  observed: number;
  /** Écart en écarts-types (loi binomiale). */
  sigma: number;
};

function check(label: string, n: number, p: number, observed: number): Check {
  const expected = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  return { label, expected, observed, sigma: sd > 0 ? (observed - expected) / sd : observed === expected ? 0 : Infinity };
}

/** Écarts observés / attendus pour chaque emplacement et chaque seuil de rareté. */
export function compareToOdds(counts: SimulationCounts, rules: DrawRules): Check[] {
  const checks: Check[] = [];
  const n = counts.normalBoosters;
  rules.slotFloors.forEach((floor, slot) => {
    const dist = slotDistribution(rules.rates, floor);
    for (const r of RARITIES) {
      if (dist[r] > 0) checks.push(check(`emplacement ${slot + 1} (${floor}+) · ${r}`, n, dist[r], counts.perSlot[slot][r]));
    }
  });
  const atLeast = atLeastOdds(rules.rates, rules.slotFloors);
  for (const r of ["EPIC", "LEGENDARY", "MYTHIC"] as const) {
    checks.push(check(`booster normal · au moins une ${r}+`, n, atLeast[r], counts.atLeast[r]));
  }
  if (rules.divineOdds > 0) checks.push(check("boosters divins", counts.boosters, 1 / rules.divineOdds, counts.divine));
  checks.push(check("boosters avec Mythique (pitié, doré, divin compris)", counts.boosters, longRunMythicRate(rules), counts.mythicBoosters));
  return checks;
}

/** Statistique du χ² d'un emplacement : Σ (observé − attendu)² / attendu. */
export function chiSquare(observed: Record<Rarity, number>, dist: Record<Rarity, number>, n: number) {
  let stat = 0;
  let categories = 0;
  for (const r of RARITIES) {
    if (dist[r] <= 0) continue;
    const expected = n * dist[r];
    stat += (observed[r] - expected) ** 2 / expected;
    categories += 1;
  }
  return { stat, df: categories - 1 };
}

/** Valeurs critiques du χ² au seuil p = 0,001, selon le nombre de degrés de liberté. */
export const CHI2_CRITICAL_001: Record<number, number> = { 1: 10.828, 2: 13.816, 3: 16.266, 4: 18.467, 5: 20.515 };
