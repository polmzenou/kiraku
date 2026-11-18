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

/** Matière de la plaque selon le prestige : laque (I à IV), feuille d'or (V à IX), nacre (X et plus). */
export type PlateMaterial = "laque" | "or" | "nacre";

export function plateMaterial(prestige: number): PlateMaterial {
  return prestige >= 10 ? "nacre" : prestige >= 5 ? "or" : "laque";
}
