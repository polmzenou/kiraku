import { describe, expect, it } from "vitest";
import { parseSetting, SETTING_DEFAULTS, SETTING_SCHEMAS, type SettingKey } from "./defaults";

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
