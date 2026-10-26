import { expect, it } from "vitest";
import { DEFAULT_RULES } from "./fixtures";
import { groupByRarity } from "./draw";
import { seededRng } from "./rng";
import { simulate } from "./simulation";

// Les simulations d'un million de boosters et par type vivent dans simulation-*.sim.test.ts.

it("compte les raretés supplémentaires et leurs garanties dans les statistiques", () => {
  const rarities = [...Object.keys(DEFAULT_RULES.rates), "CELESTIAL"];
  const rules = { ...DEFAULT_RULES, rarities, rates: { ...DEFAULT_RULES.rates, CELESTIAL: 0 }, goldenEvery: 1, goldenFloor: "CELESTIAL", divineOdds: 0, apocalypseOdds: 0 };
  const counts = simulate(seededRng(42), rules, groupByRarity([{ id: "custom", rarity: "CELESTIAL" }]), 20);
  expect(counts.mythicBoosters).toBe(20);
  expect(counts.longestDrought).toBe(0);
  expect(counts.goldenBelowFloor).toBe(0);
  expect(counts.atLeast.CELESTIAL).toBe(0); // Les boosters dorés ne sont pas comptés parmi les normaux.
});
