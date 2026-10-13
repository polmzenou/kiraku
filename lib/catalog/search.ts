// Recherche du wiki : le même nettoyage s'applique au texte indexé (Card.searchText) et à la saisie.

export const SEARCH_MAX_LENGTH = 50;

/** Minuscules, sans accents ni ponctuation superflue, espaces compactés. */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Texte indexé d'une carte : nom, nom natif et titres de la série. */
export function buildSearchText(parts: readonly (string | null | undefined)[]): string {
  return [...new Set(parts.filter((p): p is string => Boolean(p)).map(normalizeSearch).filter(Boolean))].join(" ");
}
