import { describe, expect, it } from "vitest";
import { boostRates, buildRarityTables } from "./draw";
import { DEFAULT_RULES } from "./fixtures";
import {
  cardsToNextIncense,
  extendIncense,
  fitRates,
  incenseAvailable,
  incenseDrawRules,
  incenseEarned,
  isIncenseActive,
  MAX_RATE_TOTAL,
} from "./incense";

const rates = { COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 15, AR: 8, GOLD: 2 };
const order = Object.keys(rates);
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const top = (r: Record<string, number>) => (r.LEGENDARY + r.MYTHIC + r.AR + r.GOLD) / total(r);

describe("Encens gagnés", () => {
  it("un par palier complet, rétroactif", () => {
    expect(incenseEarned(999, 1000)).toBe(0);
    expect(incenseEarned(1000, 1000)).toBe(1);
    expect(incenseEarned(5000, 1000)).toBe(5);
    expect(incenseEarned(5999, 1000)).toBe(5);
    expect(incenseEarned(5000, 0)).toBe(0);
  });

  it("disponibles = gagnés − utilisés, jamais négatif", () => {
    expect(incenseAvailable(5000, 1000, 2)).toBe(3);
    expect(incenseAvailable(5000, 1000, 5)).toBe(0);
    // Palier relevé par l'admin après coup
    expect(incenseAvailable(5000, 2000, 4)).toBe(0);
  });

  it("cartes restantes avant le prochain", () => {
    expect(cardsToNextIncense(0, 1000)).toBe(1000);
    expect(cardsToNextIncense(3412, 1000)).toBe(588);
    expect(cardsToNextIncense(4000, 1000)).toBe(1000);
  });
});

describe("durée de l'Encens", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

  it("part de maintenant sans boost en cours, ou après un boost expiré", () => {
    expect(extendIncense(null, now, 12)).toEqual(h(12));
    expect(extendIncense(h(-1), now, 12)).toEqual(h(12));
  });

  it("prolonge un boost en cours", () => {
    expect(extendIncense(h(5), now, 12)).toEqual(h(17));
  });

  it("actif jusqu'à sa fin exclue", () => {
    expect(isIncenseActive(null, now)).toBe(false);
    expect(isIncenseActive(now, now)).toBe(false);
    expect(isIncenseActive(h(1), now)).toBe(true);
  });
});

describe("taux sous Encens", () => {
  const rules = { ...DEFAULT_RULES, rates, rarities: order };

  it("triple les raretés à partir de Légendaire, total inchangé", () => {
    const boosted = incenseDrawRules(rules, { rateBoost: 30_000, boostFrom: "LEGENDARY" }).rates;
    for (const r of ["LEGENDARY", "MYTHIC", "AR", "GOLD"]) expect(boosted[r]).toBe(rates[r as keyof typeof rates] * 30_000);
    expect(top(boosted) / top(rates)).toBeCloseTo(3, 6);
    expect(Math.abs(total(boosted) - total(rates) * 10_000)).toBeLessThanOrEqual(order.length);
  });

  it("s'ajoute au boost d'un type (Impérial) sans dépasser la limite de crypto.randomInt", () => {
    // Pire cas : parts maximales de l'admin, boost ×10 du type puis ×10 de l'Encens
    const huge = Object.fromEntries(order.map((r) => [r, 1_000_000]));
    const typed = boostRates(huge, "LEGENDARY", 100_000, order);
    const boosted = incenseDrawRules({ ...rules, rates: typed }, { rateBoost: 100_000, boostFrom: "LEGENDARY" }).rates;
    expect(total(boosted)).toBeLessThan(2 ** 48);
    expect(Object.values(boosted).every(Number.isInteger)).toBe(true);
    for (const { total: t } of Object.values(buildRarityTables(boosted))) expect(t).toBeLessThan(2 ** 48);

    const imperial = boostRates(rates, "LEGENDARY", 27_000, order);
    const both = incenseDrawRules({ ...rules, rates: imperial }, { rateBoost: 30_000, boostFrom: "LEGENDARY" }).rates;
    expect(top(both)).toBeGreaterThan(top(imperial) * 2.9);
  });

  it("fitRates ne touche pas des poids sous la limite et garde les parts non nulles", () => {
    expect(fitRates(rates)).toBe(rates);
    const fitted = fitRates({ A: MAX_RATE_TOTAL, B: 1, C: 0 });
    expect(total(fitted)).toBeLessThanOrEqual(MAX_RATE_TOTAL);
    expect(fitted.B).toBe(1);
    expect(fitted.C).toBe(0);
  });
});
