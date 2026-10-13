import { THEME_COOKIE, type Theme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Applique le thème tout de suite et le mémorise pour le rendu serveur suivant. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage (cookie strictement nécessaire)
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
