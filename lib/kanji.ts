// Nombres écrits en kanji (étiquettes des boosters, titres des rouleaux du prestige). Tous ces caractères sont dans
// la police des sceaux (lib/seal-glyphs.ts).

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** De 1 à 999 avec 十 et 百 (4 → 四, 12 → 十二, 111 → 百十一) ; au-delà le nombre, rien sous 1. */
export function kanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) return "";
  if (n >= 1000) return String(n);
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  return (
    (hundreds ? (hundreds > 1 ? KANJI_DIGITS[hundreds] : "") + "百" : "") +
    (tens ? (tens > 1 ? KANJI_DIGITS[tens] : "") + "十" : "") +
    KANJI_DIGITS[units]
  );
}
