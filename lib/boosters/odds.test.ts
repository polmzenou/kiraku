import { describe, expect, it } from "vitest";
import type { Rarity } from "@/lib/catalog/rarity";
import { DEFAULT_RULES } from "./fixtures";
import { atLeastOdds, boosterChances, longRunMythicRate, mythicsPerDay, slotDistribution } from "./odds";

const rates = DEFAULT_RULES.rates;
const pct = (p: number) => p * 100;

// Tableau « Composition par type » du plan : Épique+, Légendaire+, Mythique par booster (en %).
// Standard Légendaire+ : 2,147 % exactement (le plan affichait 2,2 %, arrondi corrigé).
const PLAN_TABLE: [string, Rarity[], number, number, number][] = [
  ["Standard C · C · U+ · R+", ["COMMON", "COMMON", "UNCOMMON", "RARE"], 18.4, 2.15, 0.31],
  ["Rare R+ ×4", ["RARE", "RARE", "RARE", "RARE"], 40.4, 5.3, 0.77],
  ["Épique R+ · R+ · E+ · E+", ["RARE", "RARE", "EPIC", "EPIC"], 100, 23.1, 3.5],
  ["Légendaire E+ ×3 · L+", ["EPIC", "EPIC", "EPIC", "LEGENDARY"], 100, 100, 18.3],
  ["Mythique E+ ×3 · M", ["EPIC", "EPIC", "EPIC", "MYTHIC"], 100, 100, 100],
];

/** Écart toléré : une demi-unité de la dernière décimale affichée dans le plan. */
const halfUnit = (shown: number) => (Math.abs(shown * 10 - Math.round(shown * 10)) < 1e-9 ? 0.05 : 0.005);

describe("chances par booster (tableau du plan)", () => {
  it.each(PLAN_TABLE)("%s", (_name, floors, epic, legendary, mythic) => {
    const odds = atLeastOdds(rates, floors);
    expect(Math.abs(pct(odds.EPIC) - epic)).toBeLessThan(halfUnit(epic));
    expect(Math.abs(pct(odds.LEGENDARY) - legendary)).toBeLessThan(halfUnit(legendary));
    expect(Math.abs(pct(odds.MYTHIC) - mythic)).toBeLessThan(halfUnit(mythic));
  });

  it("un emplacement sans plancher suit les parts de la section Raretés", () => {
    const slot = slotDistribution(rates, "COMMON");
    expect(pct(slot.MYTHIC)).toBeCloseTo(0.025, 3);
    expect(pct(slot.COMMON)).toBeCloseTo(62.016, 2);
    expect(Object.values(slot).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});

describe("taux de Mythique sur le long terme", () => {
  it("sans bonus ni pitié atteignable, égal à la chance d'un booster normal", () => {
    const rules = { ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0, pityThreshold: 10_000 };
    expect(longRunMythicRate(rules)).toBeCloseTo(atLeastOdds(rates, rules.slotFloors).MYTHIC, 6);
  });

  it("la pitié seule borne l'écart : pitié à 1 = une Mythique à chaque booster", () => {
    expect(longRunMythicRate({ ...DEFAULT_RULES, pityThreshold: 1 })).toBeCloseTo(1, 12);
  });

  it("pitié seule : écart moyen ~175 boosters, une Mythique tous les ~1,2 jour (chiffres du plan)", () => {
    const { meanGap, mythicRate } = boosterChances({ ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0 });
    expect(meanGap).toBeGreaterThan(170);
    expect(meanGap).toBeLessThan(180);
    expect(1 / mythicsPerDay(mythicRate, 10)).toBeCloseTo(1.2, 1);
  });

  it("le doré et le divin rapprochent encore les Mythiques", () => {
    const withBonus = boosterChances(DEFAULT_RULES).meanGap;
    const pityOnly = boosterChances({ ...DEFAULT_RULES, goldenEvery: 0, divineOdds: 0 }).meanGap;
    expect(withBonus).toBeLessThan(pityOnly);
    expect(withBonus).toBeGreaterThan(130);
  });
});
