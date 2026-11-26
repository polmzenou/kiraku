import type { CoinSide } from "./fairness";

// Visuels peints du casino (public/casino). Renommer un fichier quand il change (-v2…) : ils sont servis
// avec une semaine de cache (next.config.ts).

const C = "/casino";

export type LoopMedia = { still: string; loop?: string };

export const CASINO_MEDIA = {
  facade: {
    closed: { mobile: { still: `${C}/facade/still-closed-mobile-v1.webp`, loop: `${C}/facade/teaser-mobile-v1.mp4` }, desktop: { still: `${C}/facade/still-closed-desktop-v1.webp` } },
    open: { mobile: { still: `${C}/facade/still-open-mobile-v1.webp`, loop: `${C}/facade/open-mobile-v1.mp4` } },
    ceremony: `${C}/facade/ceremony-mobile-v1.mp4`,
  },
  room: { still: `${C}/room/still-v1.webp`, loop: `${C}/room/loop-v1.mp4` },
  tray: `${C}/tray-v1.webp`,
  hero: `${C}/hero-v1.webp`,
  sealed: `${C}/sealed-v1.webp`,
  // Cachet en 320 px : de 24 px (règles, salon) à 104 px (sceau de la scène) sur un écran 3x
  fx: { kinpaku: `${C}/fx/kinpaku-v1.webp`, burst: `${C}/fx/burst-v1.webp`, sumi: `${C}/fx/sumi-v1.webp`, hanko: `${C}/fx/hanko-sm-v1.webp` },
} as const;

/** Face de la pièce, en 256 px : la plus grande affichée fait 128 px (vignettes, bandeaux de la scène, pièce en 3D). */
export function coinImage(side: CoinSide): string {
  return `${C}/coin/${side === "OMOTE" ? "omote" : "ura"}-sm-v1.webp`;
}

/** Kanji de la face. */
export const SIDE_KANJI: Record<CoinSide, string> = { OMOTE: "表", URA: "裏" };
