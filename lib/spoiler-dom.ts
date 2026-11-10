import { SPOILER_COOKIE, type SpoilerMode } from "./spoiler";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Floute ou rétablit tout de suite les illustrations spoil et le mémorise pour le rendu serveur suivant. */
export function applySpoilerMode(mode: SpoilerMode) {
  if (mode === "hide") document.documentElement.dataset.spoiler = "hide";
  else delete document.documentElement.dataset.spoiler;
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage (cookie strictement nécessaire)
  document.cookie = `${SPOILER_COOKIE}=${mode}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
