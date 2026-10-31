// Recherche de joueurs de la page Social, sans base : server/social/search.ts applique ces règles.
// Partielle sur les profils visibles (publics, ou « amis » pour un ami), exacte sur les autres : un
// pseudo exact trouve aussi un profil caché, montré avec le pseudo seul (comme /u/[pseudo]).

export const PLAYER_QUERY_MIN = 3;
export const PLAYER_QUERY_MAX = 20;

export type PlayerQuery = { ok: true; q: string } | { ok: false; reason: "EMPTY" | "SHORT" | "INVALID" };

/** Saisie de la recherche : un morceau de pseudo (3 à 20 lettres, chiffres, `_` ou `-`). */
export function parsePlayerQuery(raw: string | undefined): PlayerQuery {
  const q = (raw ?? "").trim();
  if (q === "") return { ok: false, reason: "EMPTY" };
  if (!/^[A-Za-z0-9_-]+$/.test(q) || q.length > PLAYER_QUERY_MAX) return { ok: false, reason: "INVALID" };
  if (q.length < PLAYER_QUERY_MIN) return { ok: false, reason: "SHORT" };
  return { ok: true, q };
}

/** Échappe les jokers de LIKE (`%`, `_`) et `\`, le caractère d'échappement par défaut de Postgres. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Motif ILIKE « contient q ». */
export function containsPattern(q: string): string {
  return `%${escapeLike(q)}%`;
}

/** Motif ILIKE « commence par q », pour classer les résultats. */
export function prefixPattern(q: string): string {
  return `${escapeLike(q)}%`;
}
