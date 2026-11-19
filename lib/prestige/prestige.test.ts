import { describe, expect, it } from "vitest";
import { evaluateCondition, type ProfileCondition, type ProfileStats } from "../profile/conditions";
import { SETTING_DEFAULTS } from "../settings/defaults";
import { eligibilityOf, requiredCount } from "./eligibility";
import { canConsecrate, heritageCap } from "./heritage";
import { bestOfCycles, mergePeak, parsePeak, type PeakStats } from "./peak";
import { kanjiNumber } from "../kanji";
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

  it("écrit le numéro d'un rouleau en kanji", () => {
    expect([1, 3, 10, 12, 20, 38, 100, 111, 999, 0, 1000].map(kanjiNumber)).toEqual(["一", "三", "十", "十二", "二十", "三十八", "百", "百十一", "九百九十九", "", "1000"]);
  });

  it("change de matière avec le niveau", () => {
    expect([1, 4, 5, 11, 12, 17, 18, 38].map(plateMaterial)).toEqual(["laque", "laque", "or", "or", "emeraude", "emeraude", "nacre", "nacre"]);
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
    expect(heritageCap({ heritageMax: 5 })).toBe(5);
    expect(heritageCap({ heritageMax: 3 })).toBe(3);
    expect(heritageCap({ heritageMax: 9 })).toBe(5);
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
    const a = { uniqueCards: 6100, byRarity: { MYTHIC: 150, COMMON: 1600 }, completedSeries: ["s1"], printingsOwned: 2 };
    const b = { uniqueCards: 900, byRarity: { MYTHIC: 160 }, completedSeries: ["s2"], printingsOwned: 5 };
    expect(mergePeak(a, b)).toEqual({ uniqueCards: 6100, byRarity: { MYTHIC: 160, COMMON: 1600 }, completedSeries: ["s1", "s2"], printingsOwned: 5 });
  });

  it("lit une photo stockée et ignore une valeur illisible", () => {
    expect(parsePeak({ uniqueCards: 3, byRarity: { RARE: 2, BAD: "x" }, completedSeries: ["s", 4], printingsOwned: 1 })).toEqual({
      uniqueCards: 3,
      byRarity: { RARE: 2 },
      completedSeries: ["s"],
      printingsOwned: 1,
    });
    // Photo prise avant que les gravées y soient comptées
    expect(parsePeak({ uniqueCards: 3, byRarity: {}, completedSeries: [] })?.printingsOwned).toBe(0);
    expect(parsePeak("nope")).toBeNull();
  });

  it("sans cycle passé ni photo lisible, le cycle en cours seul", () => {
    const now = { uniqueCards: 20, byRarity: { MYTHIC: 20 }, completedSeries: [], printingsOwned: 0 };
    expect(bestOfCycles(now, [])).toEqual(now);
    expect(bestOfCycles(now, [null, "x", 4])).toEqual(now);
  });

  it("un joueur reparti de zéro garde tout ce qu'il avait débloqué", () => {
    const stats = (peak: PeakStats, seriesProgress: ProfileStats["seriesProgress"]): ProfileStats => ({
      uniqueCards: peak.uniqueCards,
      byRarity: peak.byRarity,
      completedSeries: new Set(peak.completedSeries),
      seriesProgress,
      printingsOwned: peak.printingsOwned,
      // Ce qu'une renaissance ne touche pas : découvertes du wiki, ouvertures, échanges, rang
      discoveredPercent: 96,
      discoveredByRarity: { MYTHIC: 150, AR: 12, GOLD: 3 },
      boostersOpened: 2400,
      tradesDone: 30,
      apocalypseRuined: 1,
      tier: "GOLD",
      ambassador: false,
      prestige: 2,
    });
    // Les conditions de collection et de découverte des titres, cadres, couleurs de pseudo et thèmes de vitrine
    const conditions: ProfileCondition[] = [
      { type: "UNIQUE_CARDS", n: 1000 },
      { type: "RARITY_OWNED", rarity: "MYTHIC", n: 3 },
      { type: "RARITY_OWNED", rarity: "LEGENDARY", n: 5 },
      { type: "RARITY_OWNED", rarity: "GOLD", n: 1 },
      { type: "SERIES_COMPLETE", seriesId: "frieren" },
      { type: "SERIES_COMPLETED_COUNT", n: 2 },
      { type: "CATALOG_DISCOVERED_PERCENT", n: 95 },
      { type: "RARITIES_DISCOVERED", rarities: ["MYTHIC", "AR", "GOLD"], n: 20 },
      { type: "PRINTINGS_OWNED", n: 5 },
    ];
    // Avant la renaissance : tout est débloqué
    const before: PeakStats = { uniqueCards: 6100, byRarity: { COMMON: 1600, LEGENDARY: 80, MYTHIC: 150, GOLD: 3 }, completedSeries: ["frieren", "one-piece"], printingsOwned: 6 };
    for (const c of conditions) expect(evaluateCondition(c, stats(before, { frieren: { owned: 40, total: 40 } })).unlocked, c.type).toBe(true);
    // Après : 20 héritières dont une gravée, la photo du cycle passé relue depuis la base (JSON)
    const now: PeakStats = { uniqueCards: 20, byRarity: { MYTHIC: 18, LEGENDARY: 2 }, completedSeries: [], printingsOwned: 1 };
    const after = bestOfCycles(now, [JSON.parse(JSON.stringify(before))]);
    for (const c of conditions) expect(evaluateCondition(c, stats(after, { frieren: { owned: 1, total: 40 } })).unlocked, c.type).toBe(true);
  });
});
