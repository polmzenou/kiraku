import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, fakePool, NO_BONUS } from "./fixtures";
import { slotDistribution } from "./odds";
import { seededRng } from "./rng";
import { CHI2_CRITICAL_001, chiSquare, compareToOdds, simulate } from "./simulation";

// Preuve que les taux réels respectent le tableau : un million de boosters tirés avec la vraie
// fonction de tirage, comparés aux probabilités exactes. Graine fixe = test reproductible ;
// la tolérance de 5 écarts-types fait qu'une implémentation correcte passe avec n'importe quelle graine.

// Fichier à part (*.sim.test.ts) : les simulations lourdes tournent en parallèle.
const N = 1_000_000;
const pool = fakePool();

describe("simulation d'un million de boosters", () => {
  it("composition seule : chaque emplacement et chaque seuil suivent les parts", { timeout: 60_000 }, () => {
    const rules = { ...DEFAULT_RULES, ...NO_BONUS, pityThreshold: 10_000 };
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
});
