// Constantes d'affichage partagées par tous les types de boosters. Les boosters eux-mêmes vivent en
// base (BoosterType, lib/boosters/types.ts), chargés par seed et réglés dans l'admin.

/** Nombre de boosters qu'on peut ouvrir d'un coup (sélecteur ×1 / ×5 / ×10). */
export const OPEN_COUNTS = [1, 5, 10] as const;
export type OpenCount = (typeof OPEN_COUNTS)[number];

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
