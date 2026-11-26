import { compareRarities } from "@/lib/catalog/definitions";
import { BASE_RARITIES, type BaseRarity } from "@/lib/catalog/rarity";
import { atLeastRarity, fxTier } from "@/lib/catalog/tiers";

// Paliers du pile ou face : deux fuda se misent l'une contre l'autre si leurs raretés ont le même rang dans
// le registre (sortOrder). Mythique = BR, AR = VR, Gold = MR : une BR relève une Mythique, une AR non.

type Ordered = { key: string; sortOrder: number };

/** Palier d'une rareté (son sortOrder), ou null si elle n'est pas au registre. */
export function tierOf(rarity: string, definitions: readonly Ordered[]): number | null {
  return definitions.find((d) => d.key === rarity)?.sortOrder ?? null;
}

export type CasinoTier = {
  order: number;
  /** Raretés du palier, dans l'ordre du registre (la rareté de base d'abord). */
  rarities: string[];
};

/** Paliers jouables : raretés autorisées regroupées par rang, du plus courant au plus rare. */
export function casinoTiers(definitions: readonly Ordered[], allowed: readonly string[]): CasinoTier[] {
  const ok = new Set(allowed);
  const tiers: CasinoTier[] = [];
  for (const d of [...definitions].sort(compareRarities)) {
    if (!ok.has(d.key)) continue;
    const last = tiers.at(-1);
    if (last && last.order === d.sortOrder) last.rarities.push(d.key);
    else tiers.push({ order: d.sortOrder, rarities: [d.key] });
  }
  return tiers;
}

/** Raretés autorisées du palier `order` : ce qu'on peut miser pour relever une table de ce palier. */
export function raritiesForTier(order: number, definitions: readonly Ordered[], allowed: readonly string[]): string[] {
  return casinoTiers(definitions, allowed).find((t) => t.order === order)?.rarities ?? [];
}

/** Gros lancer : pot d'au moins `minRarity` (fil du hall mis en avant, relais Discord). */
export function isBigFlip(rarity: string, minRarity: string, definitions: readonly Ordered[]): boolean {
  return atLeastRarity(rarity, minRarity, definitions);
}

export type FlipChoreography = "toss" | "spin";

export type FlipStaging = {
  /** Lancer (coup de pouce, rebond) en dessous de Légendaire ; Toupie (la pièce tourne sur la tranche) au-dessus. */
  choreography: FlipChoreography;
  /** Palier de mise en scène (poudre d'or, assombrissement, taiko) : la rareté de base la plus proche. */
  fx: BaseRarity;
  /**
   * 0 (Commune) à 6 (au-dessus de Mythique : AR, Gold, XR…). La durée du lancer en découle, par la table des effets
   * de lib/casino/choreography.ts (flipFx) : plus le pot est rare, plus le suspense dure.
   */
  level: number;
};

const TOP_LEVEL = BASE_RARITIES.length; // 6

export function flipStaging(rarity: string, definitions: readonly Ordered[]): FlipStaging {
  const fx = fxTier(rarity, definitions);
  const mythic = tierOf("MYTHIC", definitions);
  const own = tierOf(rarity, definitions);
  const above = mythic !== null && own !== null && own > mythic;
  const level = above ? TOP_LEVEL : BASE_RARITIES.indexOf(fx);
  return {
    choreography: atLeastRarity(rarity, "LEGENDARY", definitions) ? "spin" : "toss",
    fx,
    level,
  };
}
