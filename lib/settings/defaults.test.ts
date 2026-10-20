import { describe, expect, it } from "vitest";
import { parseSetting, SETTING_DEFAULTS, SETTING_SCHEMAS, type SettingKey } from "./defaults";
import { MAX_SHOWCASE_SLOTS } from "@/lib/collection/showcase";
import { collectionSettingsSchema } from "./collection-form";

const keys = Object.keys(SETTING_SCHEMAS) as SettingKey[];

describe("réglages de jeu", () => {
  it.each(keys)("la valeur par défaut de %s passe son schéma", (key) => {
    expect(SETTING_SCHEMAS[key].safeParse(SETTING_DEFAULTS[key]).success).toBe(true);
  });

  it("utilise la valeur stockée si elle est valide", () => {
    expect(parseSetting("economy.startingZeni", 800)).toBe(800);
  });

  it("retombe sur la valeur par défaut si elle est absente ou invalide", () => {
    expect(parseSetting("economy.startingZeni", undefined)).toBe(500);
    expect(parseSetting("booster.maxStock", -3)).toBe(10);
    expect(parseSetting("booster.intervalMinutes", "10")).toBe(10);
  });
});

describe("réglages de la vitrine", () => {
  it("accepte plus de huit emplacements dans les réglages et le formulaire admin", () => {
    expect(parseSetting("showcase.slots", 10)).toBe(10);
    expect(collectionSettingsSchema.safeParse({
      "collection.recycleValues": SETTING_DEFAULTS["collection.recycleValues"],
      "showcase.slots": 10,
    }).success).toBe(true);
  });

  it("refuse un nombre d'emplacements nul, fractionnaire ou excessif", () => {
    for (const size of [0, 1.5, MAX_SHOWCASE_SLOTS + 1]) {
      expect(SETTING_SCHEMAS["showcase.slots"].safeParse(size).success).toBe(false);
    }
  });
});

describe("réglages du catalogue", () => {
  it("refuse des seuils de rareté qui ne sont pas croissants", () => {
    const bad = { mythic: 1000, legendary: 300, epic: 2500, rare: 5000, uncommon: 7500 };
    expect(parseSetting("catalog.rarityThresholds", bad)).toEqual(SETTING_DEFAULTS["catalog.rarityThresholds"]);
  });

  it("accepte une politique de rareté connue seulement", () => {
    expect(parseSetting("catalog.rarityPolicy", "LIVE")).toBe("LIVE");
    expect(parseSetting("catalog.rarityPolicy", "AUTRE")).toBe("FROZEN");
  });
});

describe("réglages des boosters", () => {
  const rates = SETTING_DEFAULTS["booster.rates"];

  it("refuse des parts négatives, décimales ou toutes nulles", () => {
    expect(parseSetting("booster.rates", { ...rates, MYTHIC: -1 })).toEqual(rates);
    expect(parseSetting("booster.rates", { ...rates, EPIC: 1.5 })).toEqual(rates);
    const zero = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };
    expect(parseSetting("booster.rates", zero)).toEqual(rates);
  });

  it("accepte des parts valides", () => {
    const custom = { ...rates, MYTHIC: 50 };
    expect(parseSetting("booster.rates", custom)).toEqual(custom);
  });

  it("borne les emplacements entre 1 et 10 raretés connues", () => {
    const floors = SETTING_DEFAULTS["booster.slotFloors"];
    expect(parseSetting("booster.slotFloors", [])).toEqual(floors);
    expect(parseSetting("booster.slotFloors", Array(11).fill("COMMON"))).toEqual(floors);
    expect(parseSetting("booster.slotFloors", ["COMMON", "SHINY"])).toEqual(["COMMON", "SHINY"]);
    expect(parseSetting("booster.slotFloors", ["COMMON", "bad key"])).toEqual(floors);
    expect(parseSetting("booster.slotFloors", ["RARE"])).toEqual(["RARE"]);
  });

  it("accepte 0 pour désactiver le doré et le divin", () => {
    expect(parseSetting("booster.goldenEvery", 0)).toBe(0);
    expect(parseSetting("booster.divineOdds", 0)).toBe(0);
    expect(parseSetting("booster.pityThreshold", 0)).toBe(250);
  });
});
