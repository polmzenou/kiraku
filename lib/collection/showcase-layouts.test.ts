import { describe, expect, it } from "vitest";
import {
  effectiveLayout,
  isHero,
  isShowcaseLayout,
  LAYOUT_SLOTS,
  LAYOUT_TEMPLATES,
  templateAreas,
  type LayoutGrid,
} from "./showcase-layouts";

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

const grids = Object.entries(LAYOUT_TEMPLATES).flatMap(([name, t]) => [
  [`${name} mobile`, t.mobile] as const,
  [`${name} ordinateur`, t.desktop] as const,
]);

describe("dispositions de la vitrine", () => {
  it.each(grids)("%s : chaque rangée a le bon nombre de colonnes", (_, grid) => {
    for (const row of grid.areas) expect(row.split(" ")).toHaveLength(grid.cols);
  });

  it.each(grids)("%s : les 8 cartes, chacune une fois, sur une zone rectangulaire", (_, grid) => {
    const cells = cellsByArea(grid);
    expect([...cells.keys()].sort()).toEqual(Array.from({ length: LAYOUT_SLOTS }, (_, i) => `s${i + 1}`).sort());
    for (const [name, list] of cells) {
      const rows = list.map(([r]) => r);
      const cols = list.map(([, c]) => c);
      const height = Math.max(...rows) - Math.min(...rows) + 1;
      const width = Math.max(...cols) - Math.min(...cols) + 1;
      expect(list, name).toHaveLength(height * width);
    }
  });

  it("les vedettes sont plus grandes que les autres cartes", () => {
    for (const t of Object.values(LAYOUT_TEMPLATES)) {
      for (const grid of [t.mobile, t.desktop]) {
        const cells = cellsByArea(grid);
        const smallest = Math.min(...[...cells.values()].map((l) => l.length));
        for (const i of t.heroes) expect(cells.get(`s${i + 1}`)!.length).toBeGreaterThan(smallest);
      }
    }
  });

  it("grille seule si la vitrine n'a pas 8 cases", () => {
    expect(effectiveLayout("TRIPTYCH", 8)).toBe("TRIPTYCH");
    expect(effectiveLayout("TRIPTYCH", 4)).toBe("GRID");
    expect(effectiveLayout("GRID", 8)).toBe("GRID");
  });

  it("reconnaît les dispositions et leurs vedettes", () => {
    expect(isShowcaseLayout("CHECKER")).toBe(true);
    expect(isShowcaseLayout("SPIRAL")).toBe(false);
    expect(isHero("TRIPTYCH", 1)).toBe(true);
    expect(isHero("FEATURED_LEFT", 1)).toBe(false);
    expect(isHero("GRID", 0)).toBe(false);
  });

  it("zones au format CSS", () => {
    expect(templateAreas({ cols: 2, areas: ["s1 s2", "s3 ."] })).toBe('"s1 s2" "s3 ."');
  });
});
