import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, DEFAULT_RUIN, fakePool } from "./fixtures";
import { seededRng } from "./rng";
import { compareToOdds, simulate } from "./simulation";

// Preuve que les taux réels respectent le tableau : un million de boosters tirés avec la vraie
// fonction de tirage, comparés aux probabilités exactes. Graine fixe = test reproductible ;
// la tolérance de 5 écarts-types fait qu'une implémentation correcte passe avec n'importe quelle graine.

// Fichier à part (*.sim.test.ts) : les simulations lourdes tournent en parallèle.
const N = 1_000_000;
const pool = fakePool();

describe("simulation d'un million de boosters", () => {
  it("séquence complète : pitié, doré et sachets scellés tiennent leurs promesses", { timeout: 60_000 }, () => {
    // Chutes 10 fois plus fréquentes qu'en jeu : assez de sachets pour mesurer leurs taux
    const rules = { ...DEFAULT_RULES, divineOdds: 400, apocalypseOdds: 200 };
    const counts = simulate(seededRng(42), rules, pool, N, undefined, DEFAULT_RUIN);

    // Garanties absolues (un booster transformé n'avance pas le doré : un doré tous les 10 boosters à cartes)
    expect(counts.longestDrought).toBeLessThan(rules.pityThreshold);
    expect(counts.golden).toBe(Math.floor((N - counts.divin - counts.apocalypse) / rules.goldenEvery));
    expect(counts.goldenMisplaced).toBe(0);
    expect(counts.goldenBelowFloor).toBe(0);
    expect(counts.pityTriggered).toBeGreaterThan(0);

    // Fréquences : chutes, Apocalyptiques épargnés (karma compris), Mythiques ≈ chaîne de Markov d'odds.ts
    const byLabel = Object.fromEntries(compareToOdds(counts, rules).map((c) => [c.label, c]));
    for (const label of [
      "sachets Divin tombés",
      "sachets Apocalyptique tombés",
      "Apocalyptiques épargnés (karma compris)",
      "boosters avec Mythique (pitié, doré, sachets compris)",
    ]) {
      const c = byLabel[label];
      expect(Math.abs(c.sigma), `${label} : attendu ${c.expected.toFixed(1)}, observé ${c.observed}`).toBeLessThan(5);
    }
  });
});
