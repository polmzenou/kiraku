// Reprise de l'ancienne vitrine unique (User.showcaseLayout + ShowcaseSlot) dans le nouveau modèle.
// Même règle que la migration SQL 20261107120000_vitrines_multiples, testée ici.
import type { ShowcaseLayoutId } from "./layouts";

export const LEGACY_LAYOUTS = ["GRID", "FEATURED_LEFT", "FEATURED_L", "TRIPTYCH", "CHECKER"] as const;
export type LegacyLayout = (typeof LEGACY_LAYOUTS)[number];

/**
 * Disposition de la vitrine reprise. Une disposition à 8 cartes ne s'appliquait qu'à une vitrine de
 * 8 cases (`size`, l'ancien réglage showcase.slots) et garde alors son identifiant ; sinon la vitrine
 * était une grille, qui devient la grille contenant sa plus haute case occupée.
 */
export function legacyLayout(layout: LegacyLayout, highestPosition: number, size: number): ShowcaseLayoutId {
  if (size === 8 && layout !== "GRID") return layout;
  if (highestPosition <= 4) return "GRID_2X2";
  if (highestPosition <= 6) return "GRID_3X2";
  if (highestPosition <= 8) return "GRID_4X2";
  if (highestPosition <= 9) return "GRID_3X3";
  if (highestPosition <= 12) return "GRID_4X3";
  return "FRIEZE";
}
