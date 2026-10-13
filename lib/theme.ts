export const THEMES = ["yoru", "washi"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "yoru";
export const THEME_COOKIE = "kiraku-theme";

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}
