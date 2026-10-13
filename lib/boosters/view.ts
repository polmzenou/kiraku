import type { FudaCard } from "@/components/fuda/Fuda";

// Données d'affichage envoyées au client après une ouverture (aucune n'est décidée par lui).

export type CardView = FudaCard & { cardId: string; anilistId: number; series: string };

export type OpenedCardView = CardView & { userCardId: string; isNew: boolean };

export type OpenedBoosterView = {
  id: string;
  golden: boolean;
  divine: boolean;
  pityTriggered: boolean;
  cards: OpenedCardView[];
};
