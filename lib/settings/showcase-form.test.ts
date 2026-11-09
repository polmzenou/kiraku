import { describe, expect, it } from "vitest";
import { THEMES_DEFAULT, type ThemesSetting } from "@/lib/showcase/themes";
import { SETTING_DEFAULTS } from "./defaults";
import { changedShowcaseKeys, normalizeThemes, showcaseSettingsSchema, themeConditionRarities, type ShowcaseSettings } from "./showcase-form";

const defaults: ShowcaseSettings = {
  "showcase.maxPerPlayer": SETTING_DEFAULTS["showcase.maxPerPlayer"],
  "showcase.themes": SETTING_DEFAULTS["showcase.themes"],
};

describe("formulaire des vitrines", () => {
  it("accepte les valeurs par défaut", () => {
    expect(showcaseSettingsSchema.safeParse(defaults).success).toBe(true);
  });

  it("refuse un nombre de vitrines hors bornes et un statut inconnu", () => {
    for (const n of [0, 21, 2.5]) expect(showcaseSettingsSchema.safeParse({ ...defaults, "showcase.maxPerPlayer": n }).success).toBe(false);
    const bad = { ...defaults, "showcase.themes": { ...THEMES_DEFAULT, ema: { status: "LATER", condition: { type: "ALWAYS" } } } };
    expect(showcaseSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it("ne relit que les réglages modifiés", () => {
    expect(changedShowcaseKeys(defaults, { ...defaults })).toEqual([]);
    expect(changedShowcaseKeys(defaults, { ...defaults, "showcase.maxPerPlayer": 8 })).toEqual(["showcase.maxPerPlayer"]);
    const themes = { ...defaults["showcase.themes"], eclat: { status: "AVAILABLE" as const, condition: { type: "RARITY_OWNED" as const, rarity: "VR", n: 1 } } };
    expect(changedShowcaseKeys(defaults, { ...defaults, "showcase.themes": themes })).toEqual(["showcase.themes"]);
  });

  it("liste les raretés citées par les conditions, sans doublon", () => {
    const themes: ThemesSetting = {
      "black-edition": { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "BR", n: 1 } },
      eclat: { status: "SOON", condition: { type: "RARITIES_DISCOVERED", rarities: ["VR", "BR"], n: 2 } },
      ema: { status: "AVAILABLE", condition: { type: "UNIQUE_CARDS", n: 100 } },
    };
    expect(themeConditionRarities(themes).sort()).toEqual(["BR", "VR"]);
  });

  it("garde Sans décor disponible et sans condition", () => {
    const themes: ThemesSetting = { none: { status: "HIDDEN", condition: { type: "AMBASSADOR" } }, ema: { status: "SOON", condition: { type: "ALWAYS" } } };
    expect(normalizeThemes(themes)).toEqual({
      none: { status: "AVAILABLE", condition: { type: "ALWAYS" } },
      ema: { status: "SOON", condition: { type: "ALWAYS" } },
    });
  });
});
