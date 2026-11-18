import { describe, expect, it } from "vitest";
import { acquireGl, glInUse } from "./gl-budget";
import {
  approach, coverFraction, grainToFrequency, hexToRgb, MATERIALIZE_MS, presenceAt, SPECTRAL_FRAGMENT, SPECTRAL_MARGIN,
  SPECTRAL_TINT, SPECTRAL_VERTEX, spectralSeed, speedToLevel, textureUrl,
} from "./spectral";

describe("carte spectrale : réglages du shader", () => {
  it("le grain passe de larges volutes à un brouillard fin, borné", () => {
    expect(grainToFrequency(0)).toBeCloseTo(0.003);
    expect(grainToFrequency(1)).toBeCloseTo(0.033);
    expect(grainToFrequency(-3)).toBe(grainToFrequency(0));
    expect(grainToFrequency(9)).toBe(grainToFrequency(1));
  });
  it("la déformation suit la vitesse du pointeur, de 0 à 1", () => {
    expect(speedToLevel(0)).toBe(0);
    expect(speedToLevel(Number.NaN)).toBe(0);
    expect(speedToLevel(700)).toBeGreaterThan(0);
    expect(speedToLevel(700)).toBeLessThan(speedToLevel(1200));
    expect(speedToLevel(50_000)).toBe(1);
  });
  it("monte vite et retombe lentement", () => {
    const up = approach(0, 1, 0.05);
    const down = 1 - approach(1, 0, 0.05);
    expect(up).toBeGreaterThan(down * 4);
    expect(approach(0.5, 0.5, 0.05)).toBe(0.5);
    expect(approach(0, 1, 0)).toBe(0);
  });
  it("l'apparition monte de 0 à 1 sans revenir en arrière", () => {
    expect(presenceAt(-1)).toBe(0);
    expect(presenceAt(0)).toBe(0);
    expect(presenceAt(1)).toBe(1);
    expect(presenceAt(2)).toBe(1);
    let last = 0;
    for (let p = 0.05; p < 1; p += 0.05) {
      expect(presenceAt(p)).toBeGreaterThan(last);
      last = presenceAt(p);
    }
    expect(MATERIALIZE_MS).toBeGreaterThan(1000);
  });
  it("cadre l'image en « cover » comme object-fit", () => {
    expect(coverFraction(1000, 1000, 500, 700)).toEqual([500 / 700, 1]);
    const [x, y] = coverFraction(460, 1400, 500, 700);
    expect(x).toBe(1);
    expect(y).toBeCloseTo((460 / 1400) / (500 / 700));
  });
  it("teinte : #rrggbb, ou la brume par défaut", () => {
    expect(hexToRgb("#ff0080")).toEqual([1, 0, 128 / 255]);
    expect(hexToRgb("rouge")).toEqual(hexToRgb(SPECTRAL_TINT));
  });
  it("texture : une adresse à part pour une image distante (requête CORS), telle quelle pour le site", () => {
    expect(textureUrl("https://s4.anilist.co/a.png")).toBe("https://s4.anilist.co/a.png?kn-gl=1");
    expect(textureUrl("https://blob.example/cards/a.webp?v=2")).toBe("https://blob.example/cards/a.webp?v=2&kn-gl=1");
    expect(textureUrl("/icons/icon-512.png")).toBe("/icons/icon-512.png");
  });
  it("chaque personnage a ses volutes, toujours les mêmes", () => {
    expect(spectralSeed("Satoru Gojo")).toBe(spectralSeed("Satoru Gojo"));
    expect(spectralSeed("Satoru Gojo")).not.toBe(spectralSeed("Rem"));
    expect(spectralSeed("Rem")).toBeGreaterThanOrEqual(0);
    expect(spectralSeed("Rem")).toBeLessThan(10);
  });
  it("sources GLSL ES 3.0 avec les uniformes que lit le canvas", () => {
    expect(SPECTRAL_VERTEX.startsWith("#version 300 es")).toBe(true);
    expect(SPECTRAL_FRAGMENT.startsWith("#version 300 es")).toBe(true);
    for (const uniform of ["uTex", "uRes", "uImg", "uFocal", "uZoom", "uTime", "uLevel", "uStrength", "uFreq", "uIdle", "uPresence", "uSeed", "uTint", "uVeil"]) {
      expect(SPECTRAL_FRAGMENT).toMatch(new RegExp(`uniform \\w+ ${uniform};`));
    }
    expect(SPECTRAL_FRAGMENT).toContain(SPECTRAL_MARGIN.toFixed(3));
  });
});

describe("budget de contextes WebGL", () => {
  it("refuse au-delà du budget et rend chaque place une seule fois", () => {
    const start = glInUse();
    const a = acquireGl(start + 2), b = acquireGl(start + 2);
    expect(a && b).toBeTruthy();
    expect(acquireGl(start + 2)).toBeNull();
    a!();
    a!();
    expect(glInUse()).toBe(start + 1);
    const c = acquireGl(start + 2);
    expect(c).toBeTruthy();
    b!();
    c!();
    expect(glInUse()).toBe(start);
  });
});
