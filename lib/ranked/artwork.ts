import type { BoardTier } from "@/lib/battle/tiers";

const FILES: Record<BoardTier, string> = {
  BRONZE: "bronze", SILVER: "silver", GOLD: "gold", EMERALD: "emerald", ELITE: "elite", CHAMPION: "champion", GRAND_CHAMPION: "grand-champion",
};

export function rankArtworkPath(tier: BoardTier, division: 1 | 2 | 3 | null = null): string {
  return `/ranks/${FILES[tier]}${division && tier !== "GRAND_CHAMPION" ? `-${division}` : ""}.png`;
}
