// Rôles de l'équipe. ADMIN : tout /admin, seul à modifier. DEV : le catalogue en brouillon (l'admin relit et
// publie ; un brouillon n'entre dans aucun tirage) et, en lecture seule, les pages de DEV_ADMIN_PAGES.

export const STAFF_ROLES = ["ADMIN", "DEV"] as const;

/**
 * Pages de l'admin ouvertes au DEV : le catalogue (brouillons), les bancs de test (rien n'est enregistré) et,
 * en lecture seule, le reste. Aucune n'est ouverte en écriture : réglages, interrupteurs de fonctionnalités et
 * données des joueurs restent l'affaire de l'admin. Les autres pages lui répondent 404. Seule exception : la file
 * de l'import Kyara, que toute l'équipe traite (canProcessKyaraImports) ; ses réglages restent à l'admin.
 */
export const DEV_ADMIN_PAGES = [
  "/admin/catalogue",
  "/admin/journal",
  "/admin/utilisateurs",
  "/admin/multi-comptes",
  "/admin/multi-comptes/echanges",
  "/admin/multi-comptes/bans",
  "/admin/fonctionnalites",
  "/admin/economie",
  "/admin/combat",
  "/admin/combat/bac-a-sable",
  "/admin/nouveautes",
  "/admin/univers",
  "/admin/vitrines",
  "/admin/boosters",
  "/admin/boosters/types",
  "/admin/test-ouverture",
  "/admin/missions",
  "/admin/expeditions",
  "/admin/parrainage",
  "/admin/avis",
  "/admin/gros-tirages",
  "/admin/evenement",
  "/admin/evenement/vitrines",
  "/admin/kyara",
  "/admin/kyara/recevoir",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type CatalogScope = "full" | "drafts";
type CardStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export function isStaff(role: string | null | undefined): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * Import Kyara (étape 17) : toute l'équipe, ADMIN et DEV, lit les collections et valide ou refuse les demandes
 * (choix du 22/11, pour vider la file plus vite). Chaque décision est écrite dans le journal admin.
 */
export function canProcessKyaraImports(role: string | null | undefined): boolean {
  return isStaff(role);
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
