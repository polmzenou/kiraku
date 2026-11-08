import { describe, expect, it } from "vitest";
import type { ProfileStats } from "@/lib/profile/conditions";
import { THEME_IDS } from "./theme-registry";
import { effectiveTheme, themeChoice, themeChoices, themeConfig, THEMES_DEFAULT, themesSettingSchema, type ThemesSetting } from "./themes";

function stats(byRarity: Record<string, number> = {}): ProfileStats {
  return {
    uniqueCards: 0,
    byRarity,
    completedSeries: new Set(),
    seriesProgress: {},
    boostersOpened: 0,
    tradesDone: 0,
    apocalypseRuined: 0,
    tier: "BRONZE",
    discoveredPercent: 0,
    discoveredByRarity: {},
    ambassador: false,
  };
}

describe("thèmes de vitrine", () => {
  it("valeurs par défaut valides pour chaque thème du registre", () => {
    expect(themesSettingSchema.safeParse(THEMES_DEFAULT).success).toBe(true);
    for (const id of THEME_IDS) expect(THEMES_DEFAULT[id]).toBeDefined();
  });

  it("Black edition se débloque avec une Black Rare", () => {
    expect(themeChoice("black-edition", {}, stats())).toEqual({
      id: "black-edition",
      state: "locked",
      current: 0,
      goal: 1,
      condition: { type: "RARITY_OWNED", rarity: "BR", n: 1 },
    });
    expect(themeChoice("black-edition", {}, stats({ BR: 1 }))).toEqual({ id: "black-edition", state: "available" });
  });

  it("Gold se débloque avec une carte Gold", () => {
    expect(themeChoice("gold", {}, stats({ BR: 4 }))).toEqual({
      id: "gold",
      state: "locked",
      current: 0,
      goal: 1,
      condition: { type: "RARITY_OWNED", rarity: "GOLD", n: 1 },
    });
    expect(themeChoice("gold", {}, stats({ GOLD: 1 }))).toEqual({ id: "gold", state: "available" });
    expect(effectiveTheme("gold", {})).toBe("gold");
  });

  it("Éclat est annoncé tant que l'admin ne l'ouvre pas", () => {
    expect(themeChoice("eclat", {}, stats({ VR: 3 }))).toEqual({ id: "eclat", state: "soon" });
    const open: ThemesSetting = { eclat: { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "VR", n: 1 } } };
    expect(themeChoice("eclat", open, stats({ VR: 1 }))).toEqual({ id: "eclat", state: "available" });
  });

  it("un thème masqué n'est pas proposé", () => {
    const setting: ThemesSetting = { ema: { status: "HIDDEN", condition: { type: "ALWAYS" } } };
    expect(themeChoice("ema", setting, stats())).toBeNull();
    expect(themeChoices(setting, stats()).map((c) => c.id)).not.toContain("ema");
  });

  it("Sans décor reste libre quoi qu'en dise le réglage", () => {
    const setting: ThemesSetting = { none: { status: "HIDDEN", condition: { type: "AMBASSADOR" } } };
    expect(themeConfig(setting, "none")).toEqual({ status: "AVAILABLE", condition: { type: "ALWAYS" } });
    expect(themeChoice("none", setting, stats())).toEqual({ id: "none", state: "available" });
  });

  it("affiche Sans décor à la place d'un thème qui n'est plus disponible", () => {
    expect(effectiveTheme("black-edition", {})).toBe("black-edition");
    expect(effectiveTheme("eclat", {})).toBe("none");
    expect(effectiveTheme("disparu", {})).toBe("none");
    expect(effectiveTheme("byobu", { byobu: { status: "SOON", condition: { type: "ALWAYS" } } })).toBe("none");
  });

  it("un thème inconnu dans le réglage ne le rend pas invalide", () => {
    const parsed = themesSettingSchema.safeParse({ ...THEMES_DEFAULT, ancien: { status: "HIDDEN", condition: { type: "ALWAYS" } } });
    expect(parsed.success).toBe(true);
  });
});
