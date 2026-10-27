import { describe, expect, it } from "vitest";
import { fitSlotGrid } from "./slot-grid";

const base = { gap: 8, maxWidth: 88, ratio: 7 / 5 };
const fits = (count: number, width: number, height: number) => {
  const g = fitSlotGrid({ ...base, count, width, height });
  const rows = Math.ceil(count / g.columns);
  return {
    ...g,
    rows,
    usedWidth: g.columns * g.slotWidth + (g.columns - 1) * base.gap,
    usedHeight: rows * g.slotWidth * base.ratio + (rows - 1) * base.gap,
  };
};

describe("grille de révélation sans défilement", () => {
  it("garde la taille max et s'étale en largeur quand il y a la place", () => {
    const g = fits(5, 1100, 300);
    expect(g.slotWidth).toBe(88);
    expect(g.rows).toBe(1);
  });

  it("passe sur plusieurs lignes pour 20 cartes", () => {
    const g = fits(20, 1100, 260);
    expect(g.rows).toBeGreaterThan(1);
    expect(g.usedWidth).toBeLessThanOrEqual(1100);
    expect(g.usedHeight).toBeLessThanOrEqual(260);
  });

  it("fait tenir 250 cartes (« Tous » plafonné) dans la place restante", () => {
    const g = fits(250, 1100, 240);
    expect(g.usedWidth).toBeLessThanOrEqual(1100);
    expect(g.usedHeight).toBeLessThanOrEqual(240);
    expect(g.slotWidth).toBeGreaterThan(0);
  });

  it("préfère plus de colonnes à taille égale", () => {
    expect(fitSlotGrid({ ...base, count: 10, width: 2000, height: 2000 }).columns).toBe(10);
  });
});
