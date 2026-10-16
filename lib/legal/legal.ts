// Pages légales versionnées (étape 10). Fonctions pures : pages publiques, écran d'acceptation des
// CGU et admin s'en servent toutes.

/** Pages publiques. La CGV n'aura sa route qu'avec un fournisseur de paiement branché. */
export const LEGAL_SLUGS = ["mentions-legales", "confidentialite", "cookies", "cgu"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_LOCALES = ["fr", "en"] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export type LegalRow = {
  locale: string;
  version: number;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: Date | null;
};

export type LegalDocument = {
  version: number;
  locale: string;
  title: string;
  body: string;
  publishedAt: Date | null;
  /** Le texte affiché est le français, faute de traduction anglaise de cette version. */
  fallback: boolean;
};

/** Versions publiées d'un slug, de la plus récente à la plus ancienne. */
export function publishedVersions(rows: readonly LegalRow[]): number[] {
  const versions = new Set(rows.filter((r) => r.status === "PUBLISHED").map((r) => r.version));
  return [...versions].sort((a, b) => b - a);
}

/**
 * Texte à afficher : la version demandée (si elle est publiée) ou la plus récente publiée, dans la
 * langue demandée, sinon en français. null si rien n'est publié.
 */
export function pickLegalDocument(
  rows: readonly LegalRow[],
  locale: string,
  requestedVersion?: number | null,
): LegalDocument | null {
  const versions = publishedVersions(rows);
  if (versions.length === 0) return null;
  const version = requestedVersion && versions.includes(requestedVersion) ? requestedVersion : versions[0];
  const published = rows.filter((r) => r.status === "PUBLISHED" && r.version === version);
  const exact = published.find((r) => r.locale === locale && r.body.trim() !== "");
  const row = exact ?? published.find((r) => r.locale === "fr") ?? published[0];
  if (!row) return null;
  return {
    version,
    locale: row.locale,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt,
    fallback: row.locale !== locale,
  };
}

/** Un compte inscrit doit (ré)accepter les CGU ; un invité n'a pas d'écran bloquant. */
export function needsTermsAcceptance(
  user: { isGuest: boolean; termsVersion: number | null },
  requiredVersion: number,
): boolean {
  if (user.isGuest) return false;
  return (user.termsVersion ?? 0) < requiredVersion;
}

// Chemins jamais masqués par l'écran d'acceptation : on doit pouvoir lire ce qu'on accepte.
const GATE_FREE = ["/connexion", "/inscription", "/verifier-email", ...LEGAL_SLUGS.map((s) => `/${s}`)];

/** `pathname` sans le préfixe de langue (`/en/cgu` → `/cgu`). */
export function stripLocale(pathname: string): string {
  const match = /^\/(fr|en)(?=\/|$)/.exec(pathname);
  const rest = match ? pathname.slice(match[0].length) : pathname;
  return rest === "" ? "/" : rest;
}

export function isTermsGateFree(pathname: string): boolean {
  const path = stripLocale(pathname);
  return GATE_FREE.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Liens des textes légaux : https, mailto et chemins internes seulement (jamais `javascript:`,
 * `data:` ni `//hôte`). Une URL refusée devient une chaîne vide (lien inerte).
 */
export function safeLegalUrl(url: string): string {
  const value = url.trim();
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value;
  if (value.startsWith("#")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "mailto:") return parsed.toString();
  } catch {
    // ni absolue ni interne
  }
  return "";
}
