import { NEWS_COOKIE } from "./news";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Mémorise la publication réduite (ou l'oublie quand on rouvre l'encart) pour le rendu serveur suivant. */
export function rememberNewsCollapsed(revision: number | null) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage, exemptée de consentement (lib/consent/registry.ts)
  document.cookie =
    revision === null
      ? `${NEWS_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`
      : `${NEWS_COOKIE}=${revision}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
