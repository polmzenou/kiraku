// État des prix du tirage de l'Ennichi (EnnichiAward.granted), pour les écrans des joueurs et l'admin. Une ligne est
// inscrite au tirage avec `{}` (encore à verser), puis le versement la remplit (`paidAt`, server/ennichi/prize.ts) ou
// l'écarte (`skipped` : compte banni ou supprimé entre-temps). Pur : partagé par les pages et l'admin.

export type AwardState = "PAID" | "PENDING" | "SKIPPED";

export function awardState(granted: unknown): AwardState {
  const g = granted && typeof granted === "object" && !Array.isArray(granted) ? granted : {};
  if ("skipped" in g) return "SKIPPED";
  return "paidAt" in g ? "PAID" : "PENDING";
}

/**
 * État d'un ensemble de prix pour un écran : null s'il n'y en a pas ; « à verser » tant que l'un l'est encore ; « écarté »
 * si tous l'ont été ; sinon versé (un prix écarté à côté de prix versés n'empêche pas « versé »).
 */
export function awardsState(states: readonly AwardState[]): AwardState | null {
  if (states.length === 0) return null;
  if (states.some((s) => s === "PENDING")) return "PENDING";
  return states.every((s) => s === "SKIPPED") ? "SKIPPED" : "PAID";
}
