import Image from "next/image";
import type { BoardTier } from "@/lib/battle/tiers";

type Division = 1 | 2 | 3;
type RankArtwork = { base: string; divisions: Record<Division, string> | null };

function tierArtwork(name: string): RankArtwork {
  return {
    base: `/ranks/${name}.png`,
    divisions: {
      1: `/ranks/${name}-1.png`,
      2: `/ranks/${name}-2.png`,
      3: `/ranks/${name}-3.png`,
    },
  };
}

const RANK_ARTWORK: Record<BoardTier, RankArtwork> = {
  BRONZE: tierArtwork("bronze"),
  SILVER: tierArtwork("silver"),
  GOLD: tierArtwork("gold"),
  EMERALD: tierArtwork("emerald"),
  ELITE: tierArtwork("elite"),
  CHAMPION: tierArtwork("champion"),
  GRAND_CHAMPION: { base: "/ranks/grand-champion.png", divisions: null },
};

/**
 * Emblème du rang et de sa division : 3 = III, 2 = II, 1 = I.
 * Sans division, affiche la variante sans cartouche ; Grand Champion a un emblème unique.
 * Décoratif par défaut : passer `label` pour qu'il soit annoncé.
 */
export function RankEmblem({
  tier,
  division = null,
  size = 64,
  label,
  className = "",
}: {
  tier: BoardTier;
  division?: Division | null;
  size?: number;
  label?: string;
  className?: string;
}) {
  const artwork = RANK_ARTWORK[tier];
  const src = division === null || artwork.divisions === null ? artwork.base : artwork.divisions[division];

  return (
    <Image
      src={src}
      width={120}
      height={140}
      sizes={`${size}px`}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={`shrink-0 max-w-none object-contain ${className}`}
      style={{ width: size, height: (size * 140) / 120 }}
    />
  );
}
