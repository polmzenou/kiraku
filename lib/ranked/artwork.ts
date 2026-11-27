import type { BoardTier } from "@/lib/battle/tiers";

const FILES: Record<BoardTier, string> = {
  BRONZE: "bronze", SILVER: "silver", GOLD: "gold", EMERALD: "emerald", ELITE: "elite", CHAMPION: "champion", GRAND_CHAMPION: "grand-champion",
};

function baseName(tier: BoardTier, division: 1 | 2 | 3 | null): string {
  return `${FILES[tier]}${division && tier !== "GRAND_CHAMPION" ? `-${division}` : ""}`;
}

/** PNG source (360 × 420) : lu sur disque pour l'image Discord des saisons, jamais servi aux pages. */
export function rankArtworkPath(tier: BoardTier, division: 1 | 2 | 3 | null = null): string {
  return `/ranks/${baseName(tier, division)}.png`;
}

/** Version des WebP produits par scripts/rank-emblems.mjs (à relever avec la sienne quand un emblème change). */
export const RANK_EMBLEM_VERSION = 1;
/** Plus grande taille affichée (px) servie par le WebP de 128 px : de quoi couvrir un écran à 3 pixels par point. */
export const RANK_EMBLEM_SMALL_MAX = 42;

/** WebP réduit pour l'affichage : 128 px de large jusqu'à 42 px affichés, 264 px au-delà. */
export function rankEmblemSrc(tier: BoardTier, division: 1 | 2 | 3 | null, size: number): string {
  const width = size <= RANK_EMBLEM_SMALL_MAX ? 128 : 264;
  return `/ranks/${baseName(tier, division)}-${width}-v${RANK_EMBLEM_VERSION}.webp`;
}
