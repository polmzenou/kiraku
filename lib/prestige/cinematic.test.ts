import { describe, expect, it } from "vitest";
import { FALLBACK_THEME } from "../boosters/types";
import { cinematicBoxes, lightParticles, particleShares, type RebirthBoosterView } from "./cinematic";

const booster: RebirthBoosterView = {
  slug: "mythique",
  name: "Mythique",
  count: 1,
  shape: "SACHET",
  theme: FALLBACK_THEME,
  emblem: "神",
  contents: "四枚入",
};

describe("cinematicBoxes", () => {
  it("révèle tout, dans l'ordre : héritières, gravées, badges, Zeni, booster", () => {
    expect(cinematicBoxes({ heirs: 20, printingsUnlocked: true, zeni: 12_000, booster }).map((b) => b.kind)).toEqual([
      "heirs",
      "printings",
      "cosmetics",
      "zeni",
      "booster",
    ]);
  });

  it("tait les box sans objet", () => {
    expect(cinematicBoxes({ heirs: 0, printingsUnlocked: false, zeni: 0, booster: null }).map((b) => b.kind)).toEqual(["cosmetics"]);
    expect(cinematicBoxes({ heirs: 3, printingsUnlocked: false, zeni: 5, booster: { ...booster, count: 0 } }).map((b) => b.kind)).toEqual([
      "heirs",
      "cosmetics",
      "zeni",
    ]);
  });

  it("porte le nombre d'héritières, les Zeni et le booster", () => {
    const boxes = cinematicBoxes({ heirs: 7, printingsUnlocked: false, zeni: 900, booster });
    expect(boxes).toContainEqual({ kind: "heirs", count: 7 });
    expect(boxes).toContainEqual({ kind: "zeni", zeni: 900 });
    expect(boxes).toContainEqual({ kind: "booster", booster });
  });
});

describe("particleShares", () => {
  it("répartit au prorata, sans dépasser le maximum", () => {
    const shares = particleShares(
      [
        { key: "COMMON", count: 600 },
        { key: "RARE", count: 300 },
        { key: "EPIC", count: 100 },
      ],
      40,
    );
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(40);
    expect(shares.get("COMMON")).toBe(24);
    expect(shares.get("RARE")).toBe(12);
    expect(shares.get("EPIC")).toBe(4);
  });

  it("garde au moins une particule par rareté présente", () => {
    const shares = particleShares(
      [
        { key: "COMMON", count: 10_000 },
        { key: "MYTHIC", count: 1 },
      ],
      48,
    );
    expect(shares.get("MYTHIC")).toBe(1);
    expect(shares.get("COMMON")).toBe(47);
  });

  it("n'en fait pas plus qu'il n'y a de cartes, et rien sans carte", () => {
    expect([...particleShares([{ key: "RARE", count: 3 }], 48).values()]).toEqual([3]);
    expect(particleShares([{ key: "RARE", count: 0 }], 48).size).toBe(0);
    expect(particleShares([], 48).size).toBe(0);
  });

  it("reste juste quand il y a plus de raretés que de places", () => {
    const piles = ["A", "B", "C", "D"].map((key) => ({ key, count: 5 }));
    expect([...particleShares(piles, 2).values()].reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("lightParticles", () => {
  const piles = [
    { key: "COMMON", color: "#aaa", count: 500 },
    { key: "LEGENDARY", color: "#d9b556", count: 20 },
  ];

  it("est déterministe pour une même graine", () => {
    expect(lightParticles(piles, 30, 7)).toEqual(lightParticles(piles, 30, 7));
  });

  it("pose chaque particule dans l'anneau, avec la couleur de sa rareté", () => {
    const particles = lightParticles(piles, 30, 3);
    expect(particles).toHaveLength(30);
    for (const p of particles) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThanOrEqual(0.55 - 1e-9);
      expect(r).toBeLessThanOrEqual(0.95 + 1e-9);
      expect(p.color).toBe(p.rarity === "COMMON" ? "#aaa" : "#d9b556");
      expect(Math.abs(p.curve)).toBeGreaterThanOrEqual(0.15);
    }
  });
});
