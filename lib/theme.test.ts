import { describe, expect, it } from "vitest";
import { parseTheme, THEME_COLORS, THEMES } from "./theme";

describe("parseTheme", () => {
  it("garde un thème connu", () => {
    expect(parseTheme("washi")).toBe("washi");
    expect(parseTheme("yoru")).toBe("yoru");
  });

  it("retombe sur Yoru sinon", () => {
    expect(parseTheme(undefined)).toBe("yoru");
    expect(parseTheme("neon")).toBe("yoru");
  });
});

describe("THEME_COLORS", () => {
  it("donne à la barre du navigateur le fond de chaque thème (tokens bg de la DA)", () => {
    expect(Object.keys(THEME_COLORS).sort()).toEqual([...THEMES].sort());
    expect(THEME_COLORS.yoru).toBe("#15120F");
    expect(THEME_COLORS.washi).toBe("#F3ECDF");
  });
});
