// Exemplaires distincts (prestige, étape 16). Un exemplaire est « spécial » s'il est héritier (il a
// traversé au moins un prestige) ou gravé (édition numérotée). Sa valeur tient à son histoire : le serveur
// ne le choisit jamais tout seul quand une carte part, c'est le joueur qui le désigne.

/**
 * Marques d'un exemplaire, lues avec COPY_MARKS. Obligatoires : une requête qui oublie de les lire ne compile pas,
 * au lieu de faire passer une pièce spéciale pour un exemplaire ordinaire.
 */
export type CopyMarks = { heritage: number; printing: number | null };

export function isSpecialCopy(copy: CopyMarks): boolean {
  return copy.heritage > 0 || copy.printing !== null;
}

/** Exemplaire gravé : tirage et numéro renseignés (la base les impose ensemble). */
export function isEngraved<T extends { printing?: number | null; serial?: number | null }>(copy: T | null | undefined): copy is T & { printing: number; serial: number } {
  return copy?.printing != null && copy.serial != null;
}

/** Filtre Prisma des exemplaires ordinaires : ni héritage ni édition gravée. */
export const ORDINARY_COPY = { heritage: 0, printing: null } as const;

/** Filtre Prisma des exemplaires spéciaux : même prédicat que l'index partiel UserCard_owner_special_idx. */
export const SPECIAL_COPY = { OR: [{ heritage: { gt: 0 } }, { printing: { not: null } }] };

/** Colonnes à lire pour reconnaître un exemplaire spécial. */
export const COPY_MARKS = { heritage: true, printing: true } as const;

/** Le joueur a bien la carte, mais seulement en exemplaires spéciaux : il doit en désigner un (`CHOOSE_COPY`). */
export function onlySpecialCopies(copies: readonly CopyMarks[]): boolean {
  return copies.length > 0 && copies.every(isSpecialCopy);
}
