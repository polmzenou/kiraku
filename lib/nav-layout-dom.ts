import { NAV_LAYOUT_COOKIE, type NavLayout } from "./nav-layout";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Bascule tout de suite entre menus groupés et barre latérale, et le mémorise pour le rendu serveur suivant. */
export function applyNavLayout(layout: NavLayout) {
  if (layout === "rail") document.documentElement.dataset.nav = "rail";
  else delete document.documentElement.dataset.nav;
  const secure = location.protocol === "https:" ? "; secure" : "";
  // Préférence d'affichage (cookie strictement nécessaire)
  document.cookie = `${NAV_LAYOUT_COOKIE}=${layout}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}
