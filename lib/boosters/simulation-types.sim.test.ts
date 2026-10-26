import { describe, expect, it } from "vitest";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { DEFAULT_RULES, fakePool, NO_BONUS } from "./fixtures";
import { poolCounts } from "./draw";
import { effectiveSlotFloors } from "./types";
import { slotDistribution } from "./odds";
import { seededRng } from "./rng";
import { CHI2_CRITICAL_001, chiSquare, compareToOdds, simulate } from "./simulation";

// Chaque type de départ à composition propre, tiré 200 000 fois avec la vraie fonction de tirage
// (sans bonus, pour isoler la composition), plus un pool troué comme celui de Josei (sans Mythique).
const TYPE_N = 200_000;
const plainRules = { ...DEFAULT_RULES, ...NO_BONUS, pityThreshold: Number.MAX_SAFE_INTEGER };
const noBonus = { golden: false, drop: false, pity: false };
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
