// Filtre « acquises / non acquises », commun à tous les onglets filtrables du marché (ventes, avis de
// recherche, échanges). Une carte est acquise dès que le joueur en a un exemplaire, quel que soit son
// statut : c'est la même règle que le badge « Acquise » (server/collection/owned.ts).

export const POSSESSIONS = ["all", "owned", "missing"] as const;
export type Possession = (typeof POSSESSIONS)[number];

/** Clé d'URL et ses valeurs, en français comme les autres paramètres du marché. */
export const POSSESSION_PARAM = "possession";
const URL_VALUE: Record<Exclude<Possession, "all">, string> = { owned: "acquises", missing: "manquantes" };

/** Valeur d'URL → filtre ; toute valeur inconnue vaut « toutes ». */
export function parsePossession(value: string | undefined | null): Possession {
  if (value === URL_VALUE.owned) return "owned";
  if (value === URL_VALUE.missing) return "missing";
  return "all";
}

/** Filtre → valeur d'URL (null pour « toutes », qui n'apparaît pas dans l'URL). */
export function possessionValue(p: Possession): string | null {
  return p === "all" ? null : URL_VALUE[p];
}
