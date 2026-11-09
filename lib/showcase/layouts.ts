// Dispositions des vitrines : 16 gabarits, sans Zod (importé côté client).
// Les grilles placent les cartes sur des zones nommées s1…sN (CSS grid-template-areas, « . » = case
// vide) ; les colonnes ont la même largeur et l'écart vertical vaut 1,4 fois l'horizontal, si bien
// qu'une vedette qui couvre k colonnes et k rangées garde exactement le format 5:7 d'une carte.
// L'Éventail pose 5 cartes en arc, la Frise défile à l'horizontale. La position 1 (et 2 quand il y a
// deux vedettes) est la carte vedette : le remplissage automatique y met les meilleures cartes.

export const LAYOUT_IDS = [
  "SOLO",
  "DUO",
  "TRIO",
  "GRID_2X2",
  "FAN",
  "FEATURED_4",
  "GRID_3X2",
  "PYRAMID",
  "FEATURED_LEFT",
  "FEATURED_L",
  "TRIPTYCH",
  "CHECKER",
  "GRID_4X2",
  "GRID_3X3",
  "GRID_4X3",
  "FRIEZE",
] as const;
export type ShowcaseLayoutId = (typeof LAYOUT_IDS)[number];

/** Disposition d'une nouvelle vitrine : six cartes de même taille. */
export const DEFAULT_LAYOUT: ShowcaseLayoutId = "GRID_3X2";

/** Cartes au plus dans une vitrine (la Frise). */
export const MAX_SHOWCASE_CARDS = 20;

export type LayoutGrid = { cols: number; areas: readonly string[] };

/** Carte de l'Éventail : position en % de la boîte (gauche : de sa largeur, haut : de sa hauteur). */
export type FanSlot = { left: number; top: number; rotate: number; z: number };

type LayoutBase = {
  capacity: number;
  /** Index (0-based) des cartes vedettes. */
  heroes: readonly number[];
};

export type GridLayout = LayoutBase & {
  kind: "grid";
  mobile: LayoutGrid;
  desktop: LayoutGrid;
  /** Largeur maximale sur ordinateur (rem), centrée. */
  maxWidthRem: number;
};

export type FanLayout = LayoutBase & {
  kind: "fan";
  /** Largeur d'une carte en % de la boîte ; hauteur de la boîte en % de sa largeur. */
  cardWidth: number;
  boxHeight: number;
  slots: readonly FanSlot[];
  maxWidthRem: number;
};

export type FriezeLayout = LayoutBase & { kind: "frieze" };

export type ShowcaseLayoutDef = GridLayout | FanLayout | FriezeLayout;

const same = (grid: LayoutGrid) => ({ mobile: grid, desktop: grid });

export const SHOWCASE_LAYOUTS: Record<ShowcaseLayoutId, ShowcaseLayoutDef> = {
  SOLO: { kind: "grid", capacity: 1, heroes: [0], ...same({ cols: 5, areas: [". s1 s1 s1 ."] }), maxWidthRem: 30 },
  DUO: { kind: "grid", capacity: 2, heroes: [0, 1], ...same({ cols: 2, areas: ["s1 s2"] }), maxWidthRem: 32 },
  TRIO: { kind: "grid", capacity: 3, heroes: [0], ...same({ cols: 7, areas: ["s2 s2 s1 s1 s1 s3 s3"] }), maxWidthRem: 38 },
  GRID_2X2: { kind: "grid", capacity: 4, heroes: [], ...same({ cols: 2, areas: ["s1 s2", "s3 s4"] }), maxWidthRem: 26 },
  FAN: {
    kind: "fan",
    capacity: 5,
    heroes: [0],
    cardWidth: 27,
    boxHeight: 56,
    // Centre, puis les deux cartes intérieures, puis les deux extérieures
    slots: [
      { left: 36.5, top: 0, rotate: 0, z: 5 },
      { left: 22, top: 4, rotate: -8, z: 4 },
      { left: 51, top: 4, rotate: 8, z: 4 },
      { left: 7.5, top: 10, rotate: -16, z: 3 },
      { left: 65.5, top: 10, rotate: 16, z: 3 },
    ],
    maxWidthRem: 36,
  },
  FEATURED_4: { kind: "grid", capacity: 5, heroes: [0], ...same({ cols: 4, areas: ["s1 s1 s2 s3", "s1 s1 s4 s5"] }), maxWidthRem: 34 },
  GRID_3X2: { kind: "grid", capacity: 6, heroes: [], ...same({ cols: 3, areas: ["s1 s2 s3", "s4 s5 s6"] }), maxWidthRem: 34 },
  PYRAMID: {
    kind: "grid",
    capacity: 6,
    heroes: [0],
    ...same({ cols: 6, areas: [". . s1 s1 . .", ". s2 s2 s3 s3 .", "s4 s4 s5 s5 s6 s6"] }),
    maxWidthRem: 30,
  },
  // « Vedette au centre » : la vedette en haut, quatre cartes puis trois en dessous
  FEATURED_LEFT: {
    kind: "grid",
    capacity: 8,
    heroes: [0],
    ...same({ cols: 8, areas: [". . s1 s1 s1 s1 . .", "s2 s2 s3 s3 s4 s4 s5 s5", ". s6 s6 s7 s7 s8 s8 ."] }),
    maxWidthRem: 36,
  },
  FEATURED_L: {
    kind: "grid",
    capacity: 8,
    heroes: [0],
    ...same({ cols: 4, areas: ["s1 s1 s1 s2", "s1 s1 s1 s3", "s1 s1 s1 s4", "s5 s6 s7 s8"] }),
    maxWidthRem: 36,
  },
  TRIPTYCH: {
    kind: "grid",
    capacity: 8,
    heroes: [0, 1],
    mobile: { cols: 6, areas: ["s1 s1 s1 s2 s2 s2", "s3 s3 s4 s4 s5 s5", "s6 s6 s7 s7 s8 s8"] },
    desktop: { cols: 7, areas: ["s1 s1 s3 s4 s5 s2 s2", "s1 s1 s6 s7 s8 s2 s2"] },
    maxWidthRem: 60,
  },
  CHECKER: {
    kind: "grid",
    capacity: 8,
    heroes: [],
    ...same({ cols: 6, areas: ["s1 s1 s2 s2 s3 s3", ". s4 s4 s5 s5 .", "s6 s6 s7 s7 s8 s8"] }),
    maxWidthRem: 45,
  },
  GRID_4X2: { kind: "grid", capacity: 8, heroes: [], ...same({ cols: 4, areas: ["s1 s2 s3 s4", "s5 s6 s7 s8"] }), maxWidthRem: 44 },
  GRID_3X3: { kind: "grid", capacity: 9, heroes: [], ...same({ cols: 3, areas: ["s1 s2 s3", "s4 s5 s6", "s7 s8 s9"] }), maxWidthRem: 34 },
  GRID_4X3: {
    kind: "grid",
    capacity: 12,
    heroes: [],
    ...same({ cols: 4, areas: ["s1 s2 s3 s4", "s5 s6 s7 s8", "s9 s10 s11 s12"] }),
    maxWidthRem: 44,
  },
  FRIEZE: { kind: "frieze", capacity: MAX_SHOWCASE_CARDS, heroes: [] },
};

export function isLayoutId(value: unknown): value is ShowcaseLayoutId {
  return typeof value === "string" && (LAYOUT_IDS as readonly string[]).includes(value);
}

export function layoutCapacity(layout: ShowcaseLayoutId): number {
  return SHOWCASE_LAYOUTS[layout].capacity;
}

/** Carte vedette dans cette disposition (plus grande, habillée en vedette par le thème). */
export function isHeroSlot(layout: ShowcaseLayoutId, index: number): boolean {
  return SHOWCASE_LAYOUTS[layout].heroes.includes(index);
}

/** Valeur CSS de grid-template-areas : `"s1 s1" "s2 s3"`. */
export function templateAreas(grid: LayoutGrid): string {
  return grid.areas.map((row) => `"${row}"`).join(" ");
}

/**
 * Hauteur d'une grille selon sa largeur w et son écart horizontal g : h = a·w + k·g (cartes au format
 * 5:7, écart vertical de 1,4 g). Chaque rangée a la hauteur de sa plus large carte qui n'occupe que
 * cette rangée ; une vedette sur plusieurs rangées les remplit exactement. `rows` compte les rangées,
 * `heroRows` celles où passe une vedette (des thèmes habillent les cartes et les rangées plus haut).
 * Sert à faire tenir une grille dans le format du fond vidéo.
 */
export type GridFit = { a: number; k: number; rows: number; heroRows: number };

export function gridFit(grid: LayoutGrid, heroes: readonly number[]): GridFit {
  const rows = grid.areas.map((row) => row.split(" "));
  const rowsOf = new Map<string, number>();
  for (const cells of rows) for (const name of new Set(cells)) if (name !== ".") rowsOf.set(name, (rowsOf.get(name) ?? 0) + 1);
  const heroNames = new Set(heroes.map((i) => `s${i + 1}`));
  let spans = 0;
  let heroRows = 0;
  rows.forEach((cells, r) => {
    const single = cells.filter((name) => name !== "." && rowsOf.get(name) === 1);
    if (single.length === 0) throw new Error(`Rangée ${r + 1} sans carte d'une seule rangée : hauteur indéterminée`);
    spans += Math.max(...single.map((name) => cells.filter((c) => c === name).length));
    if (cells.some((name) => heroNames.has(name))) heroRows += 1;
  });
  // « || 0 » : pas de -0 dans le style
  const round = (v: number) => Math.round(v * 10_000) / 10_000 || 0;
  const a = (1.4 * spans) / grid.cols;
  return { a: round(a), k: round(a - 1.4), rows: rows.length, heroRows };
}
