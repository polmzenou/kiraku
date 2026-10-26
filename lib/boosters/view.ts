import type { FudaCard } from "@/components/fuda/Fuda";
import type { ApocalypseOutcome, SealedKind } from "./draw";
import type { BoosterShape, BoosterTheme } from "./types";

// Données d'affichage envoyées au client après une ouverture (aucune n'est décidée par lui).

export type CardView = FudaCard & { cardId: string; anilistId: number; series: string };

export type OpenedCardView = CardView & {
  userCardId: string;
  isNew: boolean;
  /** Vedette de la bannière. */
  featured: boolean;
  /** Était dans la liste de souhaits du joueur (absent pour les révélations différées). */
  wished?: boolean;
};

export type OpenedBoosterView = {
  id: string;
  golden: boolean;
  /** Contenu divin : sachet Divin, ou Apocalyptique épargné. */
  divine: boolean;
  /** Sachet scellé ouvert, et l'issue d'un Apocalyptique (absents pour un booster ordinaire). */
  sealed?: SealedKind | null;
  apocalypse?: ApocalypseOutcome | null;
  pityTriggered: boolean;
  featuredHit: boolean;
  featuredPityTriggered: boolean;
  zeniSpent: number;
  cards: OpenedCardView[];
};

/** Sachet scellé tombé pendant une ouverture, à sa place dans la série (position du booster). */
export type DroppedSealedView = { id: string; kind: SealedKind; position: number };

/** Sachet scellé à ouvrir, dans l'inventaire du joueur. */
export type SealedDropView = { id: string; kind: SealedKind; giftable: boolean; giver: string | null };

/** Dessin d'un sachet scellé (thème réglé dans l'admin, textes déjà traduits). */
export type SealedDisplay = {
  kind: SealedKind;
  slug: string;
  shape: BoosterShape;
  theme: BoosterTheme;
  emblem: string;
  name: string;
  tagline: string;
  cards: number;
  contents: string;
};
