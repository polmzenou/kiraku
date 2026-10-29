// Dispositions de la vitrine du profil. La grille s'adapte à toute taille ; les autres placent
// exactement 8 cartes sur des zones nommées s1…s8 (CSS grid-template-areas), « . » = case vide.
// La position 1 (et 2 pour le Triptyque) est la carte vedette.

export const SHOWCASE_LAYOUTS = ["GRID", "FEATURED_LEFT", "FEATURED_L", "TRIPTYCH", "CHECKER"] as const;
export type ShowcaseLayout = (typeof SHOWCASE_LAYOUTS)[number];

/** Nombre d'emplacements exigé par les dispositions autres que la grille. */
export const LAYOUT_SLOTS = 8;

export type LayoutGrid = { cols: number; areas: readonly string[] };

export type LayoutTemplate = {
  mobile: LayoutGrid;
  desktop: LayoutGrid;
  /** Largeur maximale sur ordinateur (rem), centrée ; sans limite si absente. */
  maxWidthRem?: number;
  /** Index (0-based) des cartes vedettes. */
  heroes: readonly number[];
};

export const LAYOUT_TEMPLATES: Record<Exclude<ShowcaseLayout, "GRID">, LayoutTemplate> = {
  FEATURED_LEFT: {
    mobile: {
      cols: 8,
      areas: [". s1 s1 s1 s1 s1 s1 .", "s2 s2 s3 s3 s4 s4 s5 s5", ". s6 s6 s7 s7 s8 s8 ."],
    },
    desktop: {
      cols: 12,
      areas: ["s1 s1 s1 s1 s2 s2 s3 s3 s4 s4 s5 s5", "s1 s1 s1 s1 . s6 s6 s7 s7 s8 s8 ."],
    },
    heroes: [0],
  },
  FEATURED_L: {
    mobile: { cols: 4, areas: ["s1 s1 s1 s2", "s1 s1 s1 s3", "s1 s1 s1 s4", "s5 s6 s7 s8"] },
    desktop: { cols: 4, areas: ["s1 s1 s1 s2", "s1 s1 s1 s3", "s1 s1 s1 s4", "s5 s6 s7 s8"] },
    maxWidthRem: 36,
    heroes: [0],
  },
  TRIPTYCH: {
    mobile: { cols: 6, areas: ["s1 s1 s1 s2 s2 s2", "s3 s3 s4 s4 s5 s5", "s6 s6 s7 s7 s8 s8"] },
    desktop: { cols: 7, areas: ["s1 s1 s3 s4 s5 s2 s2", "s1 s1 s6 s7 s8 s2 s2"] },
    heroes: [0, 1],
  },
  CHECKER: {
    mobile: { cols: 6, areas: ["s1 s1 s2 s2 s3 s3", ". s4 s4 s5 s5 .", "s6 s6 s7 s7 s8 s8"] },
    desktop: { cols: 6, areas: ["s1 s1 s2 s2 s3 s3", ". s4 s4 s5 s5 .", "s6 s6 s7 s7 s8 s8"] },
    maxWidthRem: 45,
    heroes: [],
  },
};

export function isShowcaseLayout(value: unknown): value is ShowcaseLayout {
  return typeof value === "string" && (SHOWCASE_LAYOUTS as readonly string[]).includes(value);
}

/** Les dispositions autres que la grille ne s'appliquent qu'à une vitrine de 8 cartes. */
export function layoutsAvailable(size: number): boolean {
  return size === LAYOUT_SLOTS;
}

/** Disposition affichée : celle choisie si la vitrine a 8 cases, sinon la grille. */
export function effectiveLayout(stored: ShowcaseLayout, size: number): ShowcaseLayout {
  return layoutsAvailable(size) ? stored : "GRID";
}

/** Valeur CSS de grid-template-areas : `"s1 s1" "s2 s3"`. */
export function templateAreas(grid: LayoutGrid): string {
  return grid.areas.map((row) => `"${row}"`).join(" ");
}

/** Carte vedette dans cette disposition (plus grande, plus de pixels chargés). */
export function isHero(layout: ShowcaseLayout, index: number): boolean {
  return layout !== "GRID" && LAYOUT_TEMPLATES[layout].heroes.includes(index);
}
