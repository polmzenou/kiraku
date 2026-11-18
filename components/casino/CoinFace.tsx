import Image from "next/image";
import type { CoinSide } from "@/lib/casino/fairness";
import { coinImage } from "@/lib/casino/media";

/** Vignette d'une face de la pièce (表 vermillon, 裏 laque noire). Décorative : le texte voisin nomme la face. */
export function CoinFace({ side, size = 28, className = "" }: { side: CoinSide; size?: number; className?: string }) {
  return (
    <Image
      src={coinImage(side, size <= 128)}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full drop-shadow-[0_3px_4px_rgb(0_0_0/0.45)] ${className}`}
    />
  );
}
