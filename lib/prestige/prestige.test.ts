import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "../settings/defaults";
import { eligibilityOf, requiredCount } from "./eligibility";
import { canConsecrate, nextHeritage } from "./heritage";
import { mergePeak, parsePeak } from "./peak";
import { plateMaterial, toRoman } from "./roman";
import { rebirthRawValue, rebirthZeni } from "./zeni";

describe("chiffres romains", () => {
  it("écrit les prestiges courants", () => {
    expect([1, 3, 4, 5, 9, 12, 14, 38, 40, 90, 400, 1994].map(toRoman)).toEqual(["I", "III", "IV", "V", "IX", "XII", "XIV", "XXXVIII", "XL", "XC", "CD", "MCMXCIV"]);
  });

  it("rien pour 0 ou une valeur invalide, le nombre au-delà de 3999", () => {
    expect(toRoman(0)).toBe("");
    expect(toRoman(-2)).toBe("");
    expect(toRoman(2.5)).toBe("");
    expect(toRoman(4000)).toBe("4000");
  });

  it("change de matière avec le niveau", () => {
    expect([1, 4, 5, 9, 10, 38].map(plateMaterial)).toEqual(["laque", "laque", "or", "or", "nacre", "nacre"]);
  });
});

describe("accès à la renaissance", () => {
  const percent = SETTING_DEFAULTS["prestige.requiredPercent"];
  const order = ["COMMON", "RARE", "MYTHIC", "AR", "VR"];
  const published = { COMMON: 1684, RARE: 1684, MYTHIC: 202, AR: 24, VR: 0 };

  it("arrondit le nombre exigé au supérieur", () => {
    expect(requiredCount(1684, 85)).toBe(1432);
    expect(requiredCount(202, 70)).toBe(142);
    expect(requiredCount(24, 40)).toBe(10);
    expect(requiredCount(10, 0)).toBe(0);
    expect(requiredCount(0, 85)).toBe(0);
  });

  it("exige chaque rareté qui compte, et ignore une rareté sans carte publiée", () => {
    const owned = { COMMON: 1432, RARE: 1500, MYTHIC: 142, AR: 10 };
    const ok = eligibilityOf({ order, published, owned, percent });
    expect(ok.eligible).toBe(true);
    expect(ok.rows.map((r) => r.rarity)).toEqual(["COMMON", "RARE", "MYTHIC", "AR"]);
    const short = eligibilityOf({ order, published, owned: { ...owned, MYTHIC: 141 }, percent });
    expect(short.eligible).toBe(false);
    expect(short.rows.find((r) => r.rarity === "MYTHIC")).toMatchObject({ owned: 141, required: 142, met: false });
  });

  it("une rareté réglée à 0 % ne compte pas, une rareté absente du réglage est signalée", () => {
    const res = eligibilityOf({ order: ["COMMON", "NEW"], published: { COMMON: 10, NEW: 5 }, owned: { COMMON: 9 }, percent: { COMMON: 85 } });
    expect(res.unset).toEqual(["NEW"]);
    expect(res.eligible).toBe(true);
    expect(eligibilityOf({ order: ["COMMON"], published: { COMMON: 10 }, owned: {}, percent: { COMMON: 0 } }).eligible).toBe(false);
  });
});

describe("Zeni d'une renaissance", () => {
  const tiers = SETTING_DEFAULTS["prestige.zeniTiers"];
  const cap = SETTING_DEFAULTS["prestige.zeniCap"];

  it("paie la première tranche en entier, la deuxième à moitié, rien au-delà", () => {
    expect(rebirthZeni(51_630, tiers, cap)).toBe(51_630);
    expect(rebirthZeni(200_000, tiers, cap)).toBe(200_000);
    expect(rebirthZeni(300_001, tiers, cap)).toBe(250_000);
    expect(rebirthZeni(2_000_000, tiers, cap)).toBe(350_000);
    expect(rebirthZeni(0, tiers, cap)).toBe(0);
  });

  it("respecte le plafond", () => {
    expect(rebirthZeni(2_000_000, tiers, 100_000)).toBe(100_000);
  });

  it("une gravée vaut un multiple de sa rareté", () => {
    const values = { COMMON: 1, MYTHIC: 150 };
    const departed = [
      { rarity: "COMMON", engraved: false, count: 100 },
      { rarity: "MYTHIC", engraved: false, count: 2 },
      { rarity: "MYTHIC", engraved: true, count: 1 },
    ];
    expect(rebirthRawValue(departed, values, 5)).toBe(100 + 300 + 750);
  });
});

describe("héritage et consécration", () => {
  it("monte d'un niveau, sans dépasser le plafond ni cinq", () => {
    expect(nextHeritage(0, 5)).toBe(1);
    expect(nextHeritage(4, 5)).toBe(5);
    expect(nextHeritage(5, 5)).toBe(5);
    expect(nextHeritage(2, 3)).toBe(3);
    expect(nextHeritage(3, 9)).toBe(4);
  });

  it("la consécration se mérite : plafond atteint et gardée soi-même", () => {
    const rules = { heritageMax: 5, consecrateMinOwnCycles: 1 };
    expect(canConsecrate({ heritage: 5, keptByOwner: 1 }, rules)).toBe(true);
    expect(canConsecrate({ heritage: 5, keptByOwner: 0 }, rules)).toBe(false);
    expect(canConsecrate({ heritage: 4, keptByOwner: 3 }, rules)).toBe(false);
  });
});

describe("meilleur score d'un cycle", () => {
  it("garde le meilleur, rareté par rareté, et additionne les séries", () => {
    const a = { uniqueCards: 6100, byRarity: { MYTHIC: 150, COMMON: 1600 }, completedSeries: ["s1"] };
    const b = { uniqueCards: 900, byRarity: { MYTHIC: 160 }, completedSeries: ["s2"] };
    expect(mergePeak(a, b)).toEqual({ uniqueCards: 6100, byRarity: { MYTHIC: 160, COMMON: 1600 }, completedSeries: ["s1", "s2"] });
  });

  it("lit une photo stockée et ignore une valeur illisible", () => {
    expect(parsePeak({ uniqueCards: 3, byRarity: { RARE: 2, BAD: "x" }, completedSeries: ["s", 4] })).toEqual({ uniqueCards: 3, byRarity: { RARE: 2 }, completedSeries: ["s"] });
    expect(parsePeak("nope")).toBeNull();
  });
});
