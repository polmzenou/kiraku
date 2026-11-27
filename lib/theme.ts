export const THEMES = ["yoru", "washi"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "yoru";
export const THEME_COOKIE = "kiraku-theme";

/** Couleur de la barre du navigateur (meta theme-color) : le fond du thème choisi, pas celui du système. */
export const THEME_COLORS: Record<Theme, string> = { yoru: "#15120F", washi: "#F3ECDF" };

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}
