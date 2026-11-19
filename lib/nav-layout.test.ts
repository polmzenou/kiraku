import { describe, expect, it } from "vitest";
import { NAV_GROUPS, NAV_ITEMS, NAV_KANJI, RAIL_GROUPS, type NavKey } from "./nav";
import { DEFAULT_NAV_LAYOUT, parseNavLayout } from "./nav-layout";
import { SEAL_GLYPHS } from "./seal-glyphs";

const ALL_KEYS = Object.keys(NAV_KANJI) as NavKey[];
const sorted = (keys: NavKey[]) => [...keys].sort();

describe("disposition de la navigation desktop", () => {
  it("menus groupés par défaut, valeur inconnue ramenée au défaut", () => {
    expect(DEFAULT_NAV_LAYOUT).toBe("menu");
    expect(parseNavLayout(undefined)).toBe("menu");
    expect(parseNavLayout("sidebar")).toBe("menu");
    expect(parseNavLayout("rail")).toBe("rail");
  });

  it("barre du haut : chaque entrée apparaît une seule fois (accès direct ou menu groupé)", () => {
    const keys = [...NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)].map((i) => i.key);
    expect(sorted(keys)).toEqual(sorted(ALL_KEYS));
  });

  it("barre latérale : chaque entrée apparaît une seule fois", () => {
    const keys = RAIL_GROUPS.flat().map((i) => i.key);
    expect(sorted(keys)).toEqual(sorted(ALL_KEYS));
  });

  it("tous les kanji existent dans la police des sceaux", () => {
    const kanji = [...Object.values(NAV_KANJI), ...NAV_GROUPS.map((g) => g.kanji)];
    for (const k of kanji) expect(SEAL_GLYPHS).toContain(k);
  });
});
