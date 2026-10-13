// Boosters proposés à l'étape 3 : le standard seul. À l'étape 4, ces définitions viendront de
// BoosterType (une ligne par booster, réglée dans l'admin) avec le même thème de sachet.

export const BOOSTER_SLUGS = ["standard"] as const;
export type BoosterSlug = (typeof BOOSTER_SLUGS)[number];

export const BOOSTER_FAMILIES = ["standard"] as const;
export type BoosterFamily = (typeof BOOSTER_FAMILIES)[number];

/** Motifs traditionnels (wagara) dessinés en CSS, un par famille. */
export type Wagara = "asanoha" | "seigaiha" | "ichimatsu";

export type SachetTheme = {
  /** Couleur métallisée du sachet : teinte, reflet clair, ombre. */
  base: string;
  light: string;
  dark: string;
  pattern: Wagara;
  /** Kanji au pinceau sur l'étiquette tanzaku. */
  emblem: string;
};

export type BoosterDefinition = { slug: BoosterSlug; family: BoosterFamily; theme: SachetTheme };

export const BOOSTERS: Record<BoosterSlug, BoosterDefinition> = {
  standard: {
    slug: "standard",
    family: "standard",
    theme: { base: "#b3302a", light: "#e86a55", dark: "#5e1510", pattern: "asanoha", emblem: "福" },
  },
};

/** Kanji vertical du titre de chaque famille (縦書き). */
export const FAMILY_KANJI: Record<BoosterFamily, string> = { standard: "定番" };

/** Nombre de boosters qu'on peut ouvrir d'un coup (sélecteur ×1 / ×5 / ×10). */
export const OPEN_COUNTS = [1, 5, 10] as const;
export type OpenCount = (typeof OPEN_COUNTS)[number];

export function isBoosterSlug(value: string): value is BoosterSlug {
  return (BOOSTER_SLUGS as readonly string[]).includes(value);
}

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** Contenance en japonais sur l'étiquette : 4 → « 四枚入 » (1 à 10 cartes). */
export function contentsLabel(cards: number): string {
  return `${KANJI_DIGITS[Math.min(Math.max(cards, 1), 10)]}枚入`;
}
