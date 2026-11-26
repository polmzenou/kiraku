import type { CardView } from "@/lib/boosters/view";
import type { OutcomeRewards, RewardBundle } from "./rewards";
import type { CardBonus, ExpeditionOutcome, ExpeditionRisk } from "./types";

// Données de la page /expedition, toutes calculées par le serveur (textes déjà dans la langue du joueur).

/** Lot bonus d'un modèle, résumé pour l'affichage (« 1 carte Mythique »). */
export type ExtraLotView = { zeni: number; boosters: number; cards: { rarity: string; quantity: number }[]; namedCards: number };

export type OfferState =
  /** Jouable. */
  | "OPEN"
  /** Déjà jouée aujourd'hui (rentrée ou en route). */
  | "DONE"
  /** Part du catalogue découverte insuffisante. */
  | "LOCKED"
  /** Modèle désactivé depuis le tirage du jour. */
  | "UNAVAILABLE";

export type OfferView = {
  slot: number;
  typeId: string;
  name: string;
  lore: string;
  minRarity: string;
  risk: ExpeditionRisk;
  durationMinutes: number;
  baseSuccessPct: number;
  maxSuccessPct: number;
  maxTriumphPct: number;
  minDiscoveryPct: number;
  rewards: OutcomeRewards;
  boosterName: string;
  extraLot: ExtraLotView | null;
  state: OfferState;
  /** Le joueur a au moins une carte libre de la rareté exigée. */
  staffable: boolean;
  /** Équipes proposées (ids de Card), null si impossible. */
  suggestions: { best: string[] | null; thrifty: string[] | null };
  /** Chances de l'équipe la plus juste et de l'équipe idéale (aperçu de la fourchette). */
  range: { min: number; max: number };
};

export type TeamMemberView = CardView & { bonus: number };

export type ActiveExpeditionView = {
  id: string;
  name: string;
  minRarity: string;
  risk: ExpeditionRisk;
  startedAt: string;
  endsAt: string;
  /** En %, avec décimales possibles. */
  successPct: number;
  triumphPct: number;
  rewards: OutcomeRewards;
  boosterName: string;
  /** Lot bonus tel que recopié au départ (ou relu, pour une photo d'avant la copie). */
  extraLot: ExtraLotView | null;
  team: TeamMemberView[];
};

export type ExpeditionResultView = {
  id: string;
  name: string;
  minRarity: string;
  outcome: ExpeditionOutcome;
  reward: RewardBundle;
  boosterName: string;
  /** Slug du booster versé (lien « Ouvrir mes boosters »). */
  boosterSlug: string | null;
  /** Zeni et boosters du lot bonus réellement versés (0 sans lot, ou pour une expédition close avant ce relevé). */
  lotZeni: number;
  lotBoosters: number;
  team: TeamMemberView[];
  /** Toutes les cartes du lot bonus. */
  bonusCards: CardView[];
};

export type HistoryEntryView = {
  id: string;
  name: string;
  minRarity: string;
  /** Issue, ou ABANDONED. */
  outcome: ExpeditionOutcome | "ABANDONED";
  startedAt: string;
  /** Gains de l'issue et du lot bonus versé. */
  zeni: number;
  boosters: number;
  cards: number;
};

export type ExpeditionPageView = {
  enabled: boolean;
  /** Admin qui voit la page alors que le jeu est coupé. */
  preview: boolean;
  /** Le joueur peut lancer (jeu allumé ou aperçu admin). */
  canLaunch: boolean;
  dayKey: string;
  nextResetAt: string;
  serverNow: string;
  rules: { cardBonus: CardBonus; abandonCooldownHours: number };
  discoveryPct: number;
  offers: OfferView[];
  active: ActiveExpeditionView | null;
  /** Dernier résultat pas encore révélé. */
  result: ExpeditionResultView | null;
  /** Repos après un abandon : début (l'abandon, null s'il n'est pas connu) et fin. */
  cooldownFrom: string | null;
  cooldownUntil: string | null;
  history: HistoryEntryView[];
  /** Cartes des équipes proposées, par id de Card. */
  suggestionCards: Record<string, CardView>;
};
