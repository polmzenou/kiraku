// Constantes d'affichage partagées par tous les types de boosters. Les boosters eux-mêmes vivent en
// base (BoosterType, lib/boosters/types.ts), chargés par seed et réglés dans l'admin.

/** Nombre de boosters qu'on peut ouvrir d'un coup (sélecteur ×1 / ×5 / ×10, plus « Tous »). */
export const OPEN_COUNTS = [1, 5, 10] as const;
export type OpenCount = (typeof OPEN_COUNTS)[number];

/** Choix du sélecteur : un nombre fixe, ou « Tous » (tout le stock gratuit, ou tous les boosters crédités). */
export type OpenChoice = OpenCount | "all";

/** Plafond d'une seule ouverture, « Tous » compris : borne la transaction et la taille du récap. */
export const MAX_OPEN_COUNT = 50;

/** Ce qu'ouvre « Tous » : les `available` boosters gratuits ou crédités, plafonnés ; 0 s'il y en a moins de 2. */
export function openAllCount(available: number): number {
  const n = Math.min(Math.trunc(available), MAX_OPEN_COUNT);
  return n >= 2 ? n : 0;
}

/**
 * Choix réellement appliqué : « Tous » sans rien à ouvrir en masse retombe sur ×1, un nombre au-delà
 * de `maxFixed` (stock ou Zeni) sur le plus grand nombre fixe ouvrable.
 */
export function effectiveChoice(choice: OpenChoice, maxFixed: number, allCount: number): OpenChoice {
  if (choice === "all") return allCount > 0 ? "all" : 1;
  return choice <= maxFixed ? choice : (OPEN_COUNTS.filter((n) => n <= maxFixed).at(-1) ?? 1);
}

/** Nombre de boosters d'un choix. */
export function choiceCount(choice: OpenChoice, allCount: number): number {
  return choice === "all" ? allCount : choice;
}

/** Choix lu dans l'URL (?n=5, ?n=all depuis la vitrine) : une valeur du sélecteur, sinon ×1. */
export function parseOpenChoice(raw: string | undefined): OpenChoice {
  if (raw === "all") return "all";
  return OPEN_COUNTS.find((n) => String(n) === raw) ?? 1;
}

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** Nombre en kanji, de 1 à 99 : 4 → 四, 20 → 二十, 12 → 十二. */
export function kanjiNumber(n: number): string {
  const v = Math.min(Math.max(Math.trunc(n), 1), 99);
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  if (tens === 0) return KANJI_DIGITS[ones];
  return `${tens > 1 ? KANJI_DIGITS[tens] : ""}十${KANJI_DIGITS[ones]}`;
}

/** Contenance en japonais sur l'étiquette : 4 → « 四枚入 », 20 → « 二十枚入 ». */
export function contentsLabel(cards: number): string {
  return `${kanjiNumber(cards)}枚入`;
}
