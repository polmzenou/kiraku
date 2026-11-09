import { describe, expect, it } from "vitest";
import {
  gridFit,
  isHeroSlot,
  isLayoutId,
  layoutCapacity,
  LAYOUT_IDS,
  MAX_SHOWCASE_CARDS,
  SHOWCASE_LAYOUTS,
  templateAreas,
  type GridLayout,
  type LayoutGrid,
} from "./layouts";

/** Cases occupées par chaque zone : [rangée, colonne]. */
function cellsByArea(grid: LayoutGrid): Map<string, [number, number][]> {
  const cells = new Map<string, [number, number][]>();
  grid.areas.forEach((row, r) =>
    row.split(" ").forEach((name, c) => {
      if (name === ".") return;
      cells.set(name, [...(cells.get(name) ?? []), [r, c]]);
    }),
  );
  return cells;
}

const gridLayouts = LAYOUT_IDS.flatMap((id) => {
  const def = SHOWCASE_LAYOUTS[id];
  return def.kind === "grid" ? [[id, def] as const] : [];
});

const grids = gridLayouts.flatMap(([id, def]) => [
  [`${id} mobile`, def, def.mobile] as const,
  [`${id} ordinateur`, def, def.desktop] as const,
]);

describe("dispositions des vitrines", () => {
  it("compte seize dispositions, de 1 à 20 cartes", () => {
    expect(LAYOUT_IDS).toHaveLength(16);
    for (const id of LAYOUT_IDS) {
      expect(layoutCapacity(id)).toBeGreaterThanOrEqual(1);
      expect(layoutCapacity(id)).toBeLessThanOrEqual(MAX_SHOWCASE_CARDS);
    }
  });

  it.each(grids)("%s : chaque rangée a le bon nombre de colonnes", (_, __, grid) => {
    for (const row of grid.areas) expect(row.split(" ")).toHaveLength(grid.cols);
  });

  it.each(grids)("%s : chaque carte une fois, sur une zone rectangulaire", (_, def: GridLayout, grid) => {
    const cells = cellsByArea(grid);
    expect([...cells.keys()].sort()).toEqual(Array.from({ length: def.capacity }, (_, i) => `s${i + 1}`).sort());
    for (const [name, list] of cells) {
      const rows = list.map(([r]) => r);
      const cols = list.map(([, c]) => c);
      const height = Math.max(...rows) - Math.min(...rows) + 1;
      const width = Math.max(...cols) - Math.min(...cols) + 1;
      expect(list, name).toHaveLength(height * width);
    }
  });

  it.each(grids)("%s : une vedette n'est jamais plus petite qu'une autre carte", (_, def: GridLayout, grid) => {
    const cells = cellsByArea(grid);
    const smallest = Math.min(...[...cells.values()].map((l) => l.length));
    for (const i of def.heroes) expect(cells.get(`s${i + 1}`)!.length).toBeGreaterThanOrEqual(smallest);
  });

  it("l'Éventail place ses cinq cartes, la vedette au premier plan", () => {
    const fan = SHOWCASE_LAYOUTS.FAN;
    if (fan.kind !== "fan") throw new Error("Éventail attendu");
    expect(fan.slots).toHaveLength(fan.capacity);
    const hero = fan.slots[fan.heroes[0]];
    for (const s of fan.slots) {
      expect(s.z).toBeLessThanOrEqual(hero.z);
      expect(s.left + fan.cardWidth).toBeLessThanOrEqual(100);
    }
  });

  it("vedettes en tête de chaque disposition", () => {
    for (const id of LAYOUT_IDS) {
      SHOWCASE_LAYOUTS[id].heroes.forEach((hero, i) => expect(hero).toBe(i));
    }
    expect(isHeroSlot("TRIPTYCH", 1)).toBe(true);
    expect(isHeroSlot("FEATURED_LEFT", 1)).toBe(false);
    expect(isHeroSlot("GRID_3X2", 0)).toBe(false);
  });

  it("reconnaît les identifiants", () => {
    expect(isLayoutId("PYRAMID")).toBe(true);
    expect(isLayoutId("GRID")).toBe(false);
    expect(isLayoutId(3)).toBe(false);
  });

  it("zones au format CSS", () => {
    expect(templateAreas({ cols: 2, areas: ["s1 s2", "s3 ."] })).toBe('"s1 s2" "s3 ."');
  });
});

describe("hauteur d'une grille selon sa largeur", () => {
  // Hauteur réelle d'une grille de largeur w et d'écart g : chaque carte au format 5:7, écart vertical 1,4 g
  function simulate(grid: LayoutGrid, w: number, g: number) {
    const col = (w - (grid.cols - 1) * g) / grid.cols;
    const cardHeight = (span: number) => 1.4 * (span * col + (span - 1) * g);
    const cells = cellsByArea(grid);
    const rowHeights = grid.areas.map((_, r) =>
      Math.max(
        ...[...cells.values()]
          .filter((list) => list.every(([row]) => row === r) && list.some(([row]) => row === r))
          .map((list) => cardHeight(list.length)),
      ),
    );
    return { cells, cardHeight, rowHeights, total: rowHeights.reduce((s, h) => s + h, 0) + (grid.areas.length - 1) * 1.4 * g };
  }

  it.each(grids)("%s : h = a·w + k·g, et une vedette sur plusieurs rangées les remplit exactement", (_, def: GridLayout, grid) => {
    const fit = gridFit(grid, def.heroes);
    for (const [w, g] of [
      [330, 9.6],
      [576, 16],
      [960, 16],
    ]) {
      const { cells, cardHeight, rowHeights, total } = simulate(grid, w, g);
      expect(fit.a * w + fit.k * g).toBeCloseTo(total, 1);
      for (const list of cells.values()) {
        const rows = [...new Set(list.map(([r]) => r))];
        if (rows.length < 2) continue;
        const span = list.length / rows.length;
        const filled = rows.reduce((s, r) => s + rowHeights[r], 0) + (rows.length - 1) * 1.4 * g;
        expect(cardHeight(span)).toBeCloseTo(filled, 6);
      }
    }
  });

  it("rangées et rangées de vedettes", () => {
    const triptych = SHOWCASE_LAYOUTS.TRIPTYCH;
    if (triptych.kind !== "grid") throw new Error("grille attendue");
    expect(gridFit(triptych.desktop, triptych.heroes)).toEqual({ a: 0.4, k: -1, rows: 2, heroRows: 2 });
    expect(gridFit(triptych.mobile, triptych.heroes)).toMatchObject({ rows: 3, heroRows: 1 });
    const grid = SHOWCASE_LAYOUTS.GRID_3X3;
    if (grid.kind !== "grid") throw new Error("grille attendue");
    expect(gridFit(grid.desktop, grid.heroes)).toEqual({ a: 1.4, k: 0, rows: 3, heroRows: 0 });
  });
});
