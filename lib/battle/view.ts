import type { Rarity } from "@/lib/catalog/rarity";
import type { PlayerDecor } from "@/lib/profile/decor";
import type { RankedRules } from "@/lib/ranked/rules";
import type { BoardTier } from "./tiers";
import type { BattleEvent, BattleSetup, BattleState, EndReason, Keyword, Side, Technique } from "./types";

// Ce que les écrans de combat reçoivent du serveur (sérialisable, dates en ISO).

export type BattleModeView = "FRIEND" | "EXHIBITION" | "RANKED";
export type BattleStatusView = "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";

export type PlayerView = { username: string; image: string | null; isGuest: boolean; decor: PlayerDecor } | { bot: string };

/** Une partie vue par l'un de ses joueurs (`mySide`). */
export type BattleView = {
  id: string;
  mode: BattleModeView;
  status: BattleStatusView;
  mySide: Side;
  players: [PlayerView, PlayerView | null];
  /** Code ami, seulement pour le créateur d'une salle ouverte. */
  code: string | null;
  codeExpiresAt: string | null;
  /** Salle réservée au joueur qui la regarde (invitation) : il peut la rejoindre. */
  canJoin: boolean;
  seed: number;
  setup: BattleSetup | null;
  state: BattleState | null;
  version: number;
  turnEndsAt: string | null;
  winnerSide: Side | null;
  endReason: EndReason | null;
  rewardZeni: number;
  /** Journal, pour le replay d'une partie terminée. */
  actions: unknown[] | null;
  /** Ably configuré : le plateau est prévenu en direct (sinon il sonde). */
  realtime: boolean;
  pollSeconds: number;
  turnSeconds: number;
  /** Rang de mon camp au lancement (couleur du plateau) ; null hors classé. */
  tier: BoardTier | null;
  /** Partie classée terminée : PC avant et variation de chaque camp. */
  ranked: { crushing: boolean; before: [number | null, number | null]; delta: [number | null, number | null] } | null;
  /** Classé : rangs et barème, pour situer les PC dans l'écran de fin. */
  ladder: Pick<RankedRules, "tiers" | "grandChampion"> | null;
};

/** Ce que pousse le serveur après chaque action (Ably ou sondage). */
export type BattleUpdateView = {
  battleId: string;
  /** Version à laquelle s'appliquent ces événements. */
  from: number;
  version: number;
  events: BattleEvent[];
  state: BattleState;
  turnEndsAt: string | null;
  finished: boolean;
  rewardZeni: number;
  ranked: RankedOutcomeView | null;
};

/** Résultat classé d'un camp (diffusé avec la fin de partie). */
export type RankedSideView = {
  before: number;
  after: number;
  delta: number;
  promoted: boolean;
  demoted: boolean;
  saved: boolean;
  protection: number;
  grandBefore: boolean;
  grandAfter: boolean;
};
export type RankedOutcomeView = { crushing: boolean; sides: [RankedSideView | null, RankedSideView | null] };

/** Carte proposée au choix d'équipe, avec ce qu'elle deviendra en combat. */
export type CandidateCard = {
  cardId: string;
  anilistId: number;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  hp: number;
  keywords: Keyword[];
  technique: Technique;
};

export type HistoryItem = {
  id: string;
  mode: BattleModeView;
  opponent: PlayerView | null;
  result: "WIN" | "LOSS" | "DRAW";
  endReason: EndReason | null;
  rewardZeni: number;
  /** Classé : PC gagnés ou perdus. */
  pcDelta: number | null;
  endedAt: string;
};

/** Ce que fait le joueur en ce moment (une seule chose à la fois). */
export type Activity =
  | { kind: "NONE" }
  | { kind: "QUEUE"; mode: BattleModeView; joinedAt: string; botAt: string }
  | { kind: "ROOM"; battleId: string }
  | { kind: "BATTLE"; battleId: string };
