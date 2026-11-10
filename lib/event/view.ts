import type { ShowcaseCard } from "@/lib/collection/view";
import type { PlayerDecor } from "@/lib/profile/decor";
import type { ShowcaseLayoutId } from "@/lib/showcase/layouts";
import type { ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import type { ShowcaseEventPhase } from "./showcase";

// Données d'affichage de l'event vitrines envoyées aux composants (toutes décidées par le serveur).

export type EventPlayer = { id: string; username: string; image: string | null; decor: PlayerDecor };

/** Vitrine engagée, telle qu'elle a été photographiée à l'inscription. */
export type ShowcaseEntryView = {
  id: string;
  player: EventPlayer;
  name: string | null;
  layout: ShowcaseLayoutId;
  /** Thème affiché (ramené à Sans décor s'il n'est plus disponible). */
  theme: ShowcaseThemeId;
  /** Cases de la disposition (null = vide). */
  cards: (ShowcaseCard | null)[];
};

/** Place au classement final (votes de comptes non bannis). */
export type EntryResult = { entryId: string; rank: number; votes: number };

export type PodiumEntry = EntryResult & { player: EventPlayer };

/** État public de l'event (réglages et phase) ; `phase` est null si les dates ne forment pas une fenêtre. */
export type ShowcaseEventState = {
  enabled: boolean;
  edition: string;
  startsAt: string;
  endsAt: string;
  phase: ShowcaseEventPhase | null;
  minCards: number;
  pageSize: number;
};
