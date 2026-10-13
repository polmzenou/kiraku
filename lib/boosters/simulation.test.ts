import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, fakePool } from "./fixtures";
import { slotDistribution } from "./odds";
import { seededRng } from "./rng";
import { CHI2_CRITICAL_001, chiSquare, compareToOdds, simulate } from "./simulation";

// Preuve que les taux réels respectent le tableau : un million de boosters tirés avec la vraie
// fonction de tirage, comparés aux probabilités exactes. Graine fixe = test reproductible ;
// la tolérance de 5 écarts-types fait qu'une implémentation correcte passe avec n'importe quelle graine.

const N = 1_000_000;
const pool = fakePool();

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
