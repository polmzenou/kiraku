import { describe, expect, it } from "vitest";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { DEFAULT_RULES, fakePool } from "./fixtures";
import { groupByRarity, poolCounts } from "./draw";
import { effectiveSlotFloors } from "./types";
import { slotDistribution } from "./odds";
import { seededRng } from "./rng";
import { CHI2_CRITICAL_001, chiSquare, compareToOdds, simulate } from "./simulation";

// Preuve que les taux réels respectent le tableau : un million de boosters tirés avec la vraie
// fonction de tirage, comparés aux probabilités exactes. Graine fixe = test reproductible ;
// la tolérance de 5 écarts-types fait qu'une implémentation correcte passe avec n'importe quelle graine.

const N = 1_000_000;
const pool = fakePool();

it("compte les raretés supplémentaires et leurs garanties dans les statistiques", () => {
  const rarities = [...Object.keys(DEFAULT_RULES.rates), "CELESTIAL"];
  const rules = { ...DEFAULT_RULES, rarities, rates: { ...DEFAULT_RULES.rates, CELESTIAL: 0 }, goldenEvery: 1, goldenFloor: "CELESTIAL", divineOdds: 0 };
  const counts = simulate(seededRng(42), rules, groupByRarity([{ id: "custom", rarity: "CELESTIAL" }]), 20);
  expect(counts.mythicBoosters).toBe(20);
  expect(counts.longestDrought).toBe(0);
  expect(counts.goldenBelowFloor).toBe(0);
  expect(counts.atLeast.CELESTIAL).toBe(0); // Les boosters dorés ne sont pas comptés parmi les normaux.
});

describe("simulation d'un million de boosters", () => {
  it("composition seule : chaque emplacement et chaque seuil suivent les parts", { timeout: 60_000 }, () => {
    const rules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0, pityThreshold: 10_000 };
    const counts = simulate(seededRng(20261013), rules, pool, N);
    expect(counts.normalBoosters).toBe(N);

    for (const c of compareToOdds(counts, rules)) {
      expect(Math.abs(c.sigma), `${c.label} : attendu ${c.expected.toFixed(1)}, observé ${c.observed}`).toBeLessThan(5);
    }

    rules.slotFloors.forEach((floor, slot) => {
      const { stat, df } = chiSquare(counts.perSlot[slot], slotDistribution(rules.rates, floor), N);
      expect(stat, `χ² emplacement ${slot + 1} (${df} ddl)`).toBeLessThan(CHI2_CRITICAL_001[df]);
    });
  });

  it("séquence complète : pitié, doré et divin tiennent leurs promesses", { timeout: 60_000 }, () => {
    const rules = DEFAULT_RULES;
    const counts = simulate(seededRng(42), rules, pool, N);

    // Garanties absolues
    expect(counts.longestDrought).toBeLessThan(rules.pityThreshold);
    expect(counts.golden).toBe(N / rules.goldenEvery);
    expect(counts.goldenMisplaced).toBe(0);
    expect(counts.goldenBelowFloor).toBe(0);
    expect(counts.pityTriggered).toBeGreaterThan(0);

    // Fréquences : divin ≈ 1/2 000, Mythiques ≈ chaîne de Markov d'odds.ts
    const byLabel = Object.fromEntries(compareToOdds(counts, rules).map((c) => [c.label, c]));
    for (const label of ["boosters divins", "boosters avec Mythique (pitié, doré, divin compris)"]) {
      const c = byLabel[label];
      expect(Math.abs(c.sigma), `${label} : attendu ${c.expected.toFixed(1)}, observé ${c.observed}`).toBeLessThan(5);
    }
  });
});

// Chaque type de départ à composition propre, tiré 200 000 fois avec la vraie fonction de tirage
// (sans bonus, pour isoler la composition), plus un pool troué comme celui de Josei (sans Mythique).
const TYPE_N = 200_000;
const plainRules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0, pityThreshold: Number.MAX_SAFE_INTEGER };
const noBonus = { golden: false, divine: false, pity: false };
const typeCases = [
  ...["standard", "pochibukuro", "jubako", "rare", "epique", "legendaire", "mythique"].map((slug) => {
    const seed = BOOSTER_SEEDS.find((s) => s.slug === slug)!;
    return [slug, effectiveSlotFloors(seed.slotFloors ?? [], DEFAULT_RULES.slotFloors), fakePool()] as const;
  }),
  ["pool sans Mythique (Josei)", DEFAULT_RULES.slotFloors, fakePool(10, ["MYTHIC"])] as const,
  ["pool sans Légendaire ni Mythique", DEFAULT_RULES.slotFloors, fakePool(10, ["LEGENDARY", "MYTHIC"])] as const,
];

describe("simulation par type de booster", () => {
  it.each(typeCases)("%s", { timeout: 60_000 }, (_label, floors, typePool) => {
    const rules = { ...plainRules, slotFloors: [...floors] };
    // Graine renouvelée quand le pool factice a reçu AR et Gold : le flux aléatoire a changé.
    const counts = simulate(seededRng(20261020), rules, typePool, TYPE_N, noBonus);
    for (const c of compareToOdds(counts, rules, typePool)) {
      expect(Math.abs(c.sigma), `${c.label} : attendu ${c.expected.toFixed(1)}, observé ${c.observed}`).toBeLessThan(5);
    }
    const present = poolCounts(typePool);
    rules.slotFloors.forEach((floor, slot) => {
      const { stat, df } = chiSquare(counts.perSlot[slot], slotDistribution(rules.rates, floor, present), TYPE_N);
      if (df > 0) expect(stat, `χ² emplacement ${slot + 1} (${df} ddl)`).toBeLessThan(CHI2_CRITICAL_001[df]);
    });
  });
});
