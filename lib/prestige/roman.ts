// Chiffre romain du prestige, posé en or au-dessus de l'avatar (de I à MMMCMXCIX ; au-delà, le nombre).

const NUMERALS: readonly [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1) return "";
  if (n >= 4000) return String(n);
  let out = "";
  let rest = n;
  for (const [value, symbol] of NUMERALS) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/**
 * Nombre en kanji pour le titre d'un rouleau (巻之三, 巻之十二) : de 1 à 999 avec 十 et 百, au-delà le nombre. Tous ces
 * caractères sont dans la police des sceaux (lib/seal-glyphs.ts).
 */
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

/** Matière de la plaque selon le prestige : laque (I à IV), or (V à XI), émeraude (XII à XVII), nacre (XVIII et plus). */
export type PlateMaterial = "laque" | "or" | "emeraude" | "nacre";

export function plateMaterial(prestige: number): PlateMaterial {
  return prestige >= 18 ? "nacre" : prestige >= 12 ? "emeraude" : prestige >= 5 ? "or" : "laque";
}
