import { THEME_COLORS, THEME_COOKIE, type Theme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Applique le thème tout de suite et le mémorise pour le rendu serveur suivant. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  // Barre du navigateur (Android) : posée au rendu serveur depuis le cookie, suivie ici sans recharger
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", THEME_COLORS[theme]);
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage (cookie strictement nécessaire)
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
