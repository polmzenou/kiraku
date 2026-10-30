import Image from "next/image";
import type { BoardTier } from "@/lib/battle/tiers";
import { rankArtworkPath } from "@/lib/ranked/artwork";

type Division = 1 | 2 | 3 | null;

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
  const src = rankArtworkPath(tier, division);

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
