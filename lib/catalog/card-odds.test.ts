import { describe, expect, it } from "vitest";
import { cardOdds } from "./card-odds";
import { drawBoosters, drawSealed, groupByRarity, featuredFromPool, type DrawRules } from "@/lib/boosters/draw";
import { seededRng } from "@/lib/rng";
const pool = groupByRarity([{ id: "a", rarity: "COMMON" }, { id: "b", rarity: "COMMON" }, { id: "m", rarity: "MYTHIC" }, { id: "c", rarity: "CELESTIAL" }]);
const rules: DrawRules = { rates: { COMMON: 80, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 15, CELESTIAL: 5 },
  rarities: ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "CELESTIAL"],
  cardWeights: { a: 3, b: 1, m: 2, c: 1 }, slotFloors: ["COMMON", "COMMON", "RARE"], goldenFloor: "EPIC", pityThreshold: 10, goldenEvery: 5, divineOdds: 100,
  apocalypseOdds: 0, apocalypseWinRate: 5000, apocalypseKarma: 2 };

describe("probabilités pondérées des cartes", () => {
  it("calcule les probabilités exactes et exclut un poids nul des garanties", () => {
    const result = cardOdds({ targetId: "a", pool, rules, scenario: "normal", pityEligible: true, bonusEligible: true });
    expect(result.perSlot[0]).toBeCloseTo(0.6, 12); expect(result.atLeast).toBeCloseTo(0.84, 12);
    expect(cardOdds({ targetId: "m", pool, rules: { ...rules, cardWeights: { ...rules.cardWeights, m: 0 } }, scenario: "pity", pityEligible: true, bonusEligible: true }).atLeast).toBe(0);
  });
  it.each(["normal", "golden", "divine", "pity"] as const)("correspond au moteur réel (%s), vedettes et garanties comprises", (scenario) => {
    const featured = featuredFromPool(["b", "m"], pool, { rate: 4500, pityThreshold: 3 });
    // Un sachet Divin s'ouvre sans vedette ni pitié vedette
    const divine = scenario === "divine";
    const expected = cardOdds({ targetId: "b", pool, rules, featured: divine ? undefined : featured, scenario, pityEligible: true, bonusEligible: true, featuredPity: !divine });
    const rng = seededRng(9123); let hits = 0; const slots = [0,0,0], n = 25_000;
    for (let i=0;i<n;i++) {
      const drawRules = { ...rules, divineOdds: 0 };
      const state = { pityCount: scenario === "pity" ? 9 : 0, standardCount: scenario === "golden" ? 4 : 0, featuredCount: 2 };
      const booster = divine
        ? drawSealed(rng, { kind: "divin", pool, rules, ruin: { floors: ["COMMON"], ceiling: "UNCOMMON" }, karma: 0 })
        : drawBoosters(rng, { pool, rules: drawRules, featured, state, count: 1 }).boosters[0];
      if (booster.cards.some((c) => c.cardId === "b")) hits++;
      booster.cards.forEach((c,j) => { if(c.cardId === "b") slots[j]++; });
    }
    expect(hits/n).toBeCloseTo(expected.atLeast, 2);
    slots.forEach((count,j) => expect(count/n).toBeCloseTo(expected.perSlot[j], 2));
  });
  it("réinitialise la pitié sur une rareté supérieure à Mythique", () => {
    const result = drawBoosters(() => 0, { pool: groupByRarity([{ id: "c", rarity: "CELESTIAL" }]), rules: { ...rules, rates: { ...rules.rates, COMMON: 0, MYTHIC: 0, CELESTIAL: 1 }, divineOdds: 0, apocalypseOdds: 0 }, state: { pityCount: 9, standardCount: 0 }, count: 1 });
    expect(result.state.pityCount).toBe(0); expect(result.boosters[0].pityTriggered).toBe(false);
  });
});
