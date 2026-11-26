import type { SettingValue } from "@/lib/settings/defaults";

// Expéditions (étape 14) : types partagés par la logique pure, le serveur et les écrans.

export const EXPEDITION_RISKS = ["SAFE", "BALANCED", "RISKY"] as const;
export type ExpeditionRisk = (typeof EXPEDITION_RISKS)[number];

export const EXPEDITION_OUTCOMES = ["FAILURE", "SUCCESS", "TRIUMPH"] as const;
export type ExpeditionOutcome = (typeof EXPEDITION_OUTCOMES)[number];

/** Une équipe d'expédition compte toujours 3 cartes (règle de structure, comme l'équipe de combat). */
export const EXPEDITION_TEAM_SIZE = 3;

/** Tirage du résultat : entier de 0 à ROLL_SCALE − 1, comparé aux chances en points de base. */
export const ROLL_SCALE = 10_000;

/** Plafond du réglage expedition.offersPerDay : borne aussi l'emplacement accepté au lancement (0 à 4). */
export const MAX_OFFERS_PER_DAY = 5;

export type CardBonus = SettingValue<"expedition.cardBonus">;

/** Réglages globaux (GameSetting expedition.*). */
export type ExpeditionRules = {
  enabled: boolean;
  offersPerDay: number;
  abandonCooldownHours: number;
  cardBonus: CardBonus;
  triumphRewardPct: number;
  failRewardPct: number;
};

/** Ce qui décide des chances d'un modèle. */
export type ChanceRules = {
  minRarity: string;
  baseSuccessPct: number;
  maxSuccessPct: number;
  maxTriumphPct: number;
};

/** Ce qui décide des gains d'un modèle. */
export type RewardRules = {
  zeni: number;
  boosters: number;
  extraLotId: string | null;
};
