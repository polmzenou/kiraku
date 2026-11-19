// Disposition de la navigation desktop (≥ 1024 px) : « menu » = barre du haut avec menus groupés,
// « rail » = barre latérale verticale. Préférence d'affichage par appareil, comme le thème : cookie lu
// au rendu serveur, attribut data-nav sur <html>. Sans effet sur mobile (capsule du bas).
export const NAV_LAYOUTS = ["menu", "rail"] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];

export const DEFAULT_NAV_LAYOUT: NavLayout = "menu";
export const NAV_LAYOUT_COOKIE = "kiraku-nav";

export function parseNavLayout(value: string | null | undefined): NavLayout {
  return NAV_LAYOUTS.includes(value as NavLayout) ? (value as NavLayout) : DEFAULT_NAV_LAYOUT;
}
