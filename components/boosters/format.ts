import { useFormatter } from "next-intl";
import type { Rarity } from "@/lib/catalog/rarity";

/** Classes de fond par rareté (écrites en entier pour que Tailwind les détecte). */
export const RARITY_BG: Record<Rarity, string> = {
  COMMON: "bg-rarity-common",
  UNCOMMON: "bg-rarity-uncommon",
  RARE: "bg-rarity-rare",
  EPIC: "bg-rarity-epic",
  LEGENDARY: "bg-rarity-legendary",
  MYTHIC: "bg-rarity-mythic",
  AR: "bg-rarity-ar",
  GOLD: "bg-rarity-gold",
};

/**
 * Pourcentage lisible : 1 décimale au-dessus de 1 %, 2 en dessous, 3 sous 0,01 % pour que les AR et
 * Gold ne s'affichent pas à 0 (« 18,4 % », « 0,31 % », « 0,008 % »).
 */
export function usePercent() {
  const format = useFormatter();
  return (p: number) =>
    format.number(p, { style: "percent", maximumFractionDigits: p >= 0.01 ? 1 : p >= 0.0001 ? 2 : 3, minimumFractionDigits: 0 });
}
