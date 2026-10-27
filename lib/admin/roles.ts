// Rôles de l'équipe. ADMIN : tout /admin. DEV : le catalogue en brouillon, rien d'autre ;
// l'admin relit et publie. Un brouillon n'entre dans aucun tirage, donc n'a aucun effet sur le jeu.

export const STAFF_ROLES = ["ADMIN", "DEV"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type CatalogScope = "full" | "drafts";
type CardStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export function isStaff(role: string | null | undefined): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

export function catalogScope(role: string | null | undefined): CatalogScope | null {
  return role === "ADMIN" ? "full" : role === "DEV" ? "drafts" : null;
}

/**
 * Enregistrement d'une carte. En `drafts`, la carte reste un brouillon et ne doit avoir touché aucun
 * joueur : une carte publiée, archivée ou possédée ne se modifie que par un admin.
 */
export function canEditCatalogCard(scope: CatalogScope, before: { status: CardStatus; copies: number } | null, nextStatus: CardStatus) {
  if (scope === "full") return true;
  return nextStatus === "DRAFT" && (!before || (before.status === "DRAFT" && before.copies === 0));
}

/** Suppression : les règles de `deletableCard` s'appliquent en plus ; en `drafts`, seulement un brouillon. */
export function canDeleteCatalogCard(scope: CatalogScope, status: CardStatus) {
  return scope === "full" || status === "DRAFT";
}
