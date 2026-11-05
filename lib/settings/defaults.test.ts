import { describe, expect, it } from "vitest";
import { parseSetting, SETTING_DEFAULTS, SETTING_SCHEMAS, type SettingKey } from "./defaults";
import { MAX_SHOWCASE_SLOTS } from "@/lib/collection/showcase";
import { LEGACY_TECHNIQUES, NEW_TECHNIQUES } from "@/lib/battle/types";
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
    expect(parseSetting("ambassador.maxStock", undefined)).toBe(15);
    expect(parseSetting("ambassador.weeklyBoosterSlug", "Tout anime")).toBe("standard");
    expect(parseSetting("booster.intervalMinutes", "10")).toBe(10);
  });
});

describe("réglages du combat qui gagnent des champs avec le jeu", () => {
  const OLD_KEYWORDS = { poisonPct: 12, poisonTurns: 3, ripostePct: 40, lastWillHealPct: 25, revivePct: 30 };
  const OLD_TECHNIQUES = Object.fromEntries(LEGACY_TECHNIQUES.map((t) => [t, { cost: 4, value: 77 }]));

  it("une valeur enregistrée avant les nouveaux passifs garde les réglages de l'admin", () => {
    const parsed = parseSetting("battle.keywordValues", OLD_KEYWORDS);
    expect(parsed).toMatchObject(OLD_KEYWORDS);
    expect(parsed.lifestealPct).toBe(SETTING_DEFAULTS["battle.keywordValues"].lifestealPct);
    expect(parsed.channelOrbs).toBe(SETTING_DEFAULTS["battle.keywordValues"].channelOrbs);
  });

  it("une valeur enregistrée avant les nouvelles techniques garde les réglages de l'admin", () => {
    const parsed = parseSetting("battle.techniques", OLD_TECHNIQUES);
    for (const t of LEGACY_TECHNIQUES) expect(parsed[t]).toEqual({ cost: 4, value: 77 });
    for (const t of NEW_TECHNIQUES) expect(parsed[t]).toEqual(SETTING_DEFAULTS["battle.techniques"][t]);
  });

  it("une valeur complète n'est pas touchée", () => {
    const stored = { ...SETTING_DEFAULTS["battle.keywordValues"], armorPct: 33 };
    expect(parseSetting("battle.keywordValues", stored)).toEqual(stored);
  });

  it("un champ invalide fait toujours retomber sur les défauts, comme une valeur qui n'est pas un objet", () => {
    expect(parseSetting("battle.keywordValues", { ...OLD_KEYWORDS, poisonPct: 999 })).toEqual(SETTING_DEFAULTS["battle.keywordValues"]);
    for (const raw of [null, "x", 3, []]) expect(parseSetting("battle.techniques", raw)).toEqual(SETTING_DEFAULTS["battle.techniques"]);
  });

  it("les autres réglages ne sont pas complétés : un objet partiel reste invalide", () => {
    expect(parseSetting("battle.orbs", { start: 9 })).toEqual(SETTING_DEFAULTS["battle.orbs"]);
  });

  it("prix de l'atelier : une capacité ajoutée plus tard prend son prix par défaut sans effacer ceux de l'admin", () => {
    const defaults = SETTING_DEFAULTS["battle.abilityPrices"];
    const parsed = parseSetting("battle.abilityPrices", { keywords: { FLURRY: 9_999 }, techniques: { KONSHIN: 1_234 } });
    expect(parsed.keywords).toEqual({ ...defaults.keywords, FLURRY: 9_999 });
    expect(parsed.techniques).toEqual({ ...defaults.techniques, KONSHIN: 1_234 });
    // Un groupe absent reprend tous ses défauts
    expect(parseSetting("battle.abilityPrices", { keywords: { TAUNT: 50 } }).techniques).toEqual(defaults.techniques);
  });

  it("les défauts du combat suivent l'ordre de leur schéma : une sauvegarde de l'admin ne réécrit pas un réglage inchangé", () => {
    for (const key of Object.keys(SETTING_DEFAULTS).filter((k) => k.startsWith("battle.")) as SettingKey[]) {
      expect(JSON.stringify(SETTING_SCHEMAS[key].parse(SETTING_DEFAULTS[key])), key).toBe(JSON.stringify(SETTING_DEFAULTS[key]));
    }
  });

  it("prix de l'atelier : un prix nul ou invalide fait retomber sur les défauts", () => {
    const defaults = SETTING_DEFAULTS["battle.abilityPrices"];
    expect(parseSetting("battle.abilityPrices", { keywords: { FLURRY: 0 } })).toEqual(defaults);
    expect(parseSetting("battle.abilityPrices", { keywords: "x" })).toEqual(defaults);
    for (const raw of [null, 3, []]) expect(parseSetting("battle.abilityPrices", raw)).toEqual(defaults);
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
