import { describe, expect, it } from "vitest";
import { seededRng } from "../rng";
import { rollFrescoDrops, type FrescoCandidate } from "./draw";
import { cellOf, cropAxis, cropToGrid, DEFAULT_GRID, positionOf, tiles } from "./grid";
import { gapMaskCss, gapMaskSvg } from "./mask";
import { frescoOdds } from "./odds";
import { completedColumns, completedRows, earnedRewards, isComplete, missingPositions, rewardRef } from "./progress";

const grid = DEFAULT_GRID;
const all = Array.from({ length: 12 }, (_, p) => p);

describe("grille", () => {
  it("numérote ligne par ligne", () => {
    expect(cellOf(0, grid)).toEqual({ row: 0, col: 0 });
    expect(cellOf(5, grid)).toEqual({ row: 1, col: 1 });
    expect(cellOf(11, grid)).toEqual({ row: 2, col: 3 });
    expect(positionOf(2, 3, grid)).toBe(11);
  });

  it("découpe sans trou ni chevauchement, même sur une taille impaire", () => {
    for (const [w, h] of [[2400, 1800], [1201, 901], [1999, 1501]]) {
      const t = tiles(w, h, grid);
      expect(t).toHaveLength(12);
      expect(t.reduce((sum, c) => sum + c.width * c.height, 0)).toBe(w * h);
      for (const c of t) {
        const right = t.find((o) => o.position === c.position + 1 && cellOf(c.position, grid).row === cellOf(o.position, grid).row);
        if (right) expect(right.left).toBe(c.left + c.width);
        const below = t.find((o) => o.position === c.position + grid.cols);
        if (below) expect(below.top).toBe(c.top + c.height);
      }
    }
    expect(tiles(2400, 1800).map((c) => [c.width, c.height])).toEqual(all.map(() => [600, 600]));
  });

  it("recadre en 4:3 sur l'axe en trop, au cadrage choisi", () => {
    expect(cropToGrid(3200, 1800, 0.5)).toEqual({ left: 400, top: 0, width: 2400, height: 1800 });
    expect(cropToGrid(3200, 1800, 0)).toMatchObject({ left: 0 });
    expect(cropToGrid(3200, 1800, 1)).toMatchObject({ left: 800 });
    expect(cropToGrid(1800, 1800, 0.5)).toEqual({ left: 0, top: 225, width: 1800, height: 1350 });
    expect(cropToGrid(1800, 1800, 7)).toMatchObject({ top: 450 });
    expect(cropAxis(2400, 1800)).toBeNull();
    expect(cropAxis(3200, 1800)).toBe("x");
    expect(cropAxis(1800, 1800)).toBe("y");
  });
});

describe("progression", () => {
  it("repère lignes, colonnes et complétion", () => {
    const owned = new Set([0, 1, 2, 3, 4, 8]);
    expect(completedRows(owned, grid)).toEqual([0]);
    expect(completedColumns(owned, grid)).toEqual([0]);
    expect(isComplete(owned, grid)).toBe(false);
    expect(isComplete(new Set(all), grid)).toBe(true);
    expect(missingPositions(owned, grid)).toEqual([5, 6, 7, 9, 10, 11]);
  });

  it("verse un fragment nouveau, puis la ligne, la colonne et la fresque qui se remplissent", () => {
    expect(earnedRewards(new Set(), [5], grid)).toEqual([{ kind: "PIECE", index: 5 }]);
    expect(earnedRewards(new Set([0, 1, 2, 4]), [8, 3], grid)).toEqual([
      { kind: "PIECE", index: 8 },
      { kind: "PIECE", index: 3 },
      { kind: "ROW", index: 0 },
      { kind: "COLUMN", index: 0 },
    ]);
    const last = earnedRewards(new Set(all.filter((p) => p !== 11)), [11], grid);
    expect(last).toEqual([
      { kind: "PIECE", index: 11 },
      { kind: "ROW", index: 2 },
      { kind: "COLUMN", index: 3 },
      { kind: "COMPLETE", index: 0 },
    ]);
  });

  it("ne verse rien pour un fragment déjà possédé ni deux fois une ligne", () => {
    expect(earnedRewards(new Set([0, 1, 2, 3]), [2], grid)).toEqual([]);
    expect(earnedRewards(new Set([0, 1, 2, 3]), [4], grid)).toEqual([{ kind: "PIECE", index: 4 }]);
    expect(earnedRewards(new Set(), [7, 7], grid)).toEqual([{ kind: "PIECE", index: 7 }]);
  });

  it("forme la référence de journal", () => {
    expect(rewardRef("fr1", { kind: "ROW", index: 2 })).toBe("fr1:ROW:2");
  });
});

const fresco = (id: string, extra: Partial<FrescoCandidate> = {}): FrescoCandidate => ({ id, grid, weight: 1, boosterTypeIds: [], ...extra });

describe("chute des fragments", () => {
  it("ne donne jamais un fragment déjà possédé, même sur une ouverture de 9", () => {
    const drops = rollFrescoDrops(seededRng(7), { count: 9, rate: 10_000, boosterTypeId: "std", candidates: [fresco("a")], owned: new Map([["a", new Set([0, 1, 2])]]) });
    const positions = drops.map((d) => d?.position);
    expect(drops.every((d) => d !== null)).toBe(true);
    expect(new Set(positions).size).toBe(9);
    expect(positions.some((p) => p !== undefined && p <= 2)).toBe(false);
  });

  it("s'arrête quand la fresque est finie : le reste de l'ouverture ne donne rien", () => {
    const drops = rollFrescoDrops(seededRng(1), { count: 5, rate: 10_000, boosterTypeId: "std", candidates: [fresco("a")], owned: new Map([["a", new Set(all.slice(0, 10))]]) });
    expect(drops.filter(Boolean)).toHaveLength(2);
    expect(drops.slice(2)).toEqual([null, null, null]);
  });

  it("respecte les boosters de chute et le poids", () => {
    const only = fresco("only", { boosterTypeIds: ["focus"] });
    expect(rollFrescoDrops(seededRng(2), { count: 20, rate: 10_000, boosterTypeId: "std", candidates: [only], owned: new Map() }).every((d) => d === null)).toBe(true);
    expect(rollFrescoDrops(seededRng(2), { count: 3, rate: 10_000, boosterTypeId: "focus", candidates: [only], owned: new Map() }).every((d) => d?.frescoId === "only")).toBe(true);
    const zero = rollFrescoDrops(seededRng(3), { count: 20, rate: 10_000, boosterTypeId: "std", candidates: [fresco("z", { weight: 0 })], owned: new Map() });
    expect(zero.every((d) => d === null)).toBe(true);
  });

  it("tombe au taux réglé", () => {
    const rng = seededRng(42);
    let hits = 0;
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      // Fresque remise à zéro à chaque jet : on ne mesure que la chance du jet
      if (rollFrescoDrops(rng, { count: 1, rate: 550, boosterTypeId: "std", candidates: [fresco("a")], owned: new Map() })[0]) hits++;
    }
    const p = 0.055;
    const sigma = Math.sqrt(n * p * (1 - p));
    expect(Math.abs(hits - n * p)).toBeLessThan(5 * sigma);
    expect(rollFrescoDrops(seededRng(5), { count: 50, rate: 0, boosterTypeId: "std", candidates: [fresco("a")], owned: new Map() }).every((d) => d === null)).toBe(true);
  });

  it("partage les fragments entre fresques selon leur poids", () => {
    const rng = seededRng(9);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 6_000; i++) {
      const [d] = rollFrescoDrops(rng, { count: 1, rate: 10_000, boosterTypeId: "std", candidates: [fresco("a", { weight: 3 }), fresco("b", { weight: 1 })], owned: new Map() });
      if (d) counts[d.frescoId as "a" | "b"]++;
    }
    expect(counts.a / (counts.a + counts.b)).toBeGreaterThan(0.72);
    expect(counts.a / (counts.a + counts.b)).toBeLessThan(0.78);
  });
});

describe("chances affichées", () => {
  it("1 booster sur 18 et ~218 boosters pour une fresque", () => {
    expect(frescoOdds(550, 12)).toEqual({ oneIn: 18, boostersToComplete: 218 });
    expect(frescoOdds(550, 12, 2).boostersToComplete).toBe(436);
    expect(frescoOdds(0, 12)).toEqual({ oneIn: null, boostersToComplete: null });
  });
});


describe("masque des cases vides", () => {
  it("une forme d'un seul tenant : les fragments du bord débordent du cadre, les voisins se recouvrent", () => {
    const svg = gapMaskSvg(new Set([0, 1, 5]), grid)!;
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain('<rect x="-60" y="-60" width="161" height="161"/>');
    expect(svg).toContain('<rect x="99" y="-60" width="102" height="161"/>');
    expect(svg).toContain('<rect x="99" y="99" width="102" height="102"/>');
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).toContain("feMorphology");
  });

  it("rien pour une fresque complète, une url de données sinon", () => {
    expect(gapMaskSvg(new Set(all), grid)).toBeNull();
    expect(gapMaskCss(new Set([3]), grid)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
