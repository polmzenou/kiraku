import type { Rarity } from "@/lib/catalog/rarity";
import {
  ALL_BONUSES,
  apocalypseSparedShare,
  buildRarityTables,
  drawBoosters,
  drawSealed,
  poolCounts,
  rarityIndex,
  type CardPool,
  type DrawBonuses,
  type DrawRules,
  type RuinRules,
} from "./draw";
import { atLeastOdds, dropRates, longRunMythicRate, slotDistribution, type PoolCounts } from "./odds";
import type { Rng } from "./rng";

// Simulation de millions de boosters, comparée aux probabilités exactes d'odds.ts.
// Utilisée par simulation.test.ts et par `npm run sim:boosters`.

export type SimulationCounts = {
  boosters: number;
  /** Rareté obtenue par emplacement (hors doré, sachet scellé et pitié). */
  perSlot: Record<Rarity, number>[];
  /** Boosters normaux contenant au moins une carte ≥ R. */
  atLeast: Record<Rarity, number>;
  normalBoosters: number;
  mythicBoosters: number;
  golden: number;
  /** Sachets tombés, ouverts aussitôt (karma compris) : ils comptent pour le booster d'origine. */
  divin: number;
  apocalypse: number;
  spared: number;
  pityTriggered: number;
  /** Plus longue série de boosters sans Mythique. */
  longestDrought: number;
  /** Boosters dorés dont la dernière carte est sous le plancher doré (doit rester à 0). */
  goldenBelowFloor: number;
  /** Boosters dorés mal placés (doit rester à 0). */
  goldenMisplaced: number;
};

const zero = (order: readonly Rarity[]) => Object.fromEntries(order.map((r) => [r, 0])) as Record<Rarity, number>;

export function simulate(
  rng: Rng,
  rules: DrawRules,
  pool: CardPool,
  boosters: number,
  bonuses: DrawBonuses = ALL_BONUSES,
  ruin: RuinRules = { floors: ["COMMON", "COMMON", "COMMON", "UNCOMMON"], ceiling: "UNCOMMON" },
): SimulationCounts {
  const order = rules.rarities ?? Object.keys(rules.rates);
  const tables = buildRarityTables(rules.rates);
  const counts: SimulationCounts = {
    boosters,
    perSlot: rules.slotFloors.map(() => zero(order)),
    atLeast: zero(order),
    normalBoosters: 0,
    mythicBoosters: 0,
    golden: 0,
    divin: 0,
    apocalypse: 0,
    spared: 0,
    pityTriggered: 0,
    longestDrought: 0,
    goldenBelowFloor: 0,
    goldenMisplaced: 0,
  };
  let state = { pityCount: 0, standardCount: 0 };
  let drought = 0;
  let karma = 0;
  const chunk = 10_000;

  for (let done = 0; done < boosters; done += chunk) {
    const count = Math.min(chunk, boosters - done);
    let standard = state.standardCount;
    const result = drawBoosters(rng, { pool, rules, state, count, tables, bonuses });
    state = result.state;

    result.boosters.forEach((b) => {
      let cards = b.cards;
      if (b.drop) {
        const sealed = drawSealed(rng, { kind: b.drop, pool, rules, ruin, karma, tables });
        karma = sealed.karma;
        cards = sealed.cards;
        counts[b.drop] += 1;
        if (sealed.outcome === "SPARED") counts.spared += 1;
      }
      const hasMythic = cards.some((c) => rarityIndex(c.rarity, order) >= rarityIndex("MYTHIC", order));
      if (hasMythic) {
        counts.mythicBoosters += 1;
        drought = 0;
      } else {
        drought += 1;
        counts.longestDrought = Math.max(counts.longestDrought, drought);
      }
      if (b.drop) return;
      if (b.pityTriggered) counts.pityTriggered += 1;
      if (b.golden) {
        counts.golden += 1;
        if (rarityIndex(b.cards.at(-1)!.rarity, order) < rarityIndex(rules.goldenFloor, order)) counts.goldenBelowFloor += 1;
      }
      // Un booster transformé n'avance pas le doré : seuls les boosters à cartes comptent
      const shouldBeGolden = bonuses.golden && rules.goldenEvery > 0 && (standard + 1) % rules.goldenEvery === 0;
      if (bonuses.golden) standard += 1;
      if (b.golden !== shouldBeGolden) counts.goldenMisplaced += 1;

      if (b.golden || b.pityTriggered) return;
      counts.normalBoosters += 1;
      b.cards.forEach((c, slot) => (counts.perSlot[slot][c.rarity] += 1));
      const best = Math.max(...b.cards.map((c) => rarityIndex(c.rarity, order)));
      for (const r of order) if (rarityIndex(r, order) <= best) counts.atLeast[r] += 1;
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

/**
 * Écarts observés / attendus pour chaque emplacement et chaque seuil de rareté. `pool` : les chances
 * attendues tiennent compte de ses paliers vides (même repli qu'au tirage).
 */
export function compareToOdds(counts: SimulationCounts, rules: DrawRules, pool?: CardPool): Check[] {
  const order = rules.rarities ?? Object.keys(rules.rates);
  const checks: Check[] = [];
  const n = counts.normalBoosters;
  const present: PoolCounts | undefined = pool ? poolCounts(pool) : undefined;
  rules.slotFloors.forEach((floor, slot) => {
    const dist = slotDistribution(rules.rates, floor, present);
    for (const r of order) {
      if (dist[r] > 0) checks.push(check(`emplacement ${slot + 1} (${floor}+) · ${r}`, n, dist[r], counts.perSlot[slot][r]));
    }
  });
  const atLeast = atLeastOdds(rules.rates, rules.slotFloors, present);
  for (const r of order.slice(order.indexOf("EPIC"))) {
    checks.push(check(`booster normal · au moins une ${r}+`, n, atLeast[r], counts.atLeast[r]));
  }
  const drops = dropRates(rules);
  if (drops.divin > 0) checks.push(check("sachets Divin tombés", counts.boosters, drops.divin, counts.divin));
  if (drops.apocalypse > 0) {
    checks.push(check("sachets Apocalyptique tombés", counts.boosters, drops.apocalypse, counts.apocalypse));
    // Le karma rend les issues dépendantes : l'écart reste une indication, pas un test exact
    checks.push(check("Apocalyptiques épargnés (karma compris)", counts.apocalypse, apocalypseSparedShare(rules.apocalypseWinRate, rules.apocalypseKarma), counts.spared));
  }
  if (!present || present.MYTHIC > 0) {
    checks.push(check("boosters avec Mythique (pitié, doré, sachets compris)", counts.boosters, longRunMythicRate(rules), counts.mythicBoosters));
  }
  return checks;
}

/**
 * Statistique du χ² d'un emplacement : Σ (observé − attendu)² / attendu. Les raretés les plus hautes
 * attendues moins de 5 fois (Gold, AR…) sont regroupées, sinon l'approximation du χ² ne tient plus.
 */
export function chiSquare(observed: Record<Rarity, number>, dist: Record<Rarity, number>, n: number) {
  const cells = Object.keys(dist).filter((r) => dist[r] > 0).map((r) => ({ expected: n * dist[r], observed: observed[r] ?? 0 }));
  // Les clés vont de la plus commune à la plus rare : on fusionne la queue jusqu'à 5 attendus.
  while (cells.length > 1 && cells[cells.length - 1].expected < 5) {
    const tail = cells.pop()!;
    cells[cells.length - 1].expected += tail.expected;
    cells[cells.length - 1].observed += tail.observed;
  }
  const stat = cells.reduce((sum, c) => sum + (c.observed - c.expected) ** 2 / c.expected, 0);
  return { stat, df: cells.length - 1 };
}

/** Valeurs critiques du χ² au seuil p = 0,001, selon le nombre de degrés de liberté. */
export const CHI2_CRITICAL_001: Record<number, number> = { 1: 10.828, 2: 13.816, 3: 16.266, 4: 18.467, 5: 20.515, 6: 22.458, 7: 24.322 };
