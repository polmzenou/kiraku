import { cellCount, type Grid } from "./grid";
import type { EarnedReward } from "./progress";

// Ce qu'un joueur reçoit d'une fresque. Jamais l'image entière tant qu'elle n'est pas complète, jamais
// l'URL d'un fragment qu'il n'a pas : on ne peut rien deviner de ce qui manque.

export type FrescoPieceView = { position: number; imageUrl: string };

export type FrescoView = Grid & {
  id: string;
  name: string;
  /** Fragments possédés, par position. */
  pieces: FrescoPieceView[];
  /** Image entière, seulement quand tous les fragments sont là. */
  fullImageUrl: string | null;
  /** Mode spoiler, comme une carte : marquage et clé d'univers. */
  spoiler: boolean;
  spoilerKey: string | null;
};

export type FrescoProgress = { owned: number; total: number; complete: boolean };

export function frescoProgress(view: Pick<FrescoView, "cols" | "rows" | "pieces" | "fullImageUrl">): FrescoProgress {
  const total = cellCount(view);
  return { owned: Math.min(total, view.pieces.length), total, complete: view.fullImageUrl !== null };
}

/** Contenu d'un lot versé, déjà prêt pour l'écran (Zeni, boosters crédités, cartes à révéler). */
export type FrescoRewardSummary<Card = unknown> = { zeni: number; boosters: number; cards: Card[] };

/** Fragment tombé d'un booster, avec la fresque telle que le joueur la voit après lui. */
export type FrescoDropView<Card = unknown> = {
  fresco: FrescoView;
  /** Le fragment tombé (aussi présent dans fresco.pieces). */
  position: number;
  rewards: (EarnedReward & { lotName: string | null; reward: FrescoRewardSummary<Card> | null })[];
};
