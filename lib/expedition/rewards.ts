import { ROLL_SCALE, type ExpeditionOutcome, type ExpeditionRules, type RewardRules } from "./types";

// Résultat et gains d'une expédition. Le tirage se fait à la clôture (jamais au lancement) : abandonner
// pour relancer n'apporte donc rien. Les gains de chaque issue sont photographiés au lancement.

export type RewardBundle = {
  zeni: number;
  boosters: number;
  /** Le lot bonus du modèle est versé. */
  extraLot: boolean;
};

export type OutcomeRewards = Record<ExpeditionOutcome, RewardBundle>;

/** Issue d'un tirage `roll` (0 à 9 999) contre des chances en points de base. */
export function outcomeFor(roll: number, successBp: number, triumphBp: number): ExpeditionOutcome {
  if (!Number.isInteger(roll) || roll < 0 || roll >= ROLL_SCALE) throw new RangeError("roll");
  if (roll < triumphBp) return "TRIUMPH";
  if (roll < successBp) return "SUCCESS";
  return "FAILURE";
}

/**
 * Gains de chaque issue. Réussite : Zeni, boosters et lot bonus. Triomphe : Zeni et boosters majorés
 * (boosters arrondis au supérieur) et lot bonus. Échec : une part des Zeni seulement.
 */
export function rewardsByOutcome(
  type: RewardRules,
  rules: Pick<ExpeditionRules, "triumphRewardPct" | "failRewardPct">,
): OutcomeRewards {
  const extraLot = type.extraLotId !== null;
  return {
    SUCCESS: { zeni: type.zeni, boosters: type.boosters, extraLot },
    TRIUMPH: {
      zeni: Math.round((type.zeni * rules.triumphRewardPct) / 100),
      boosters: Math.ceil((type.boosters * rules.triumphRewardPct) / 100),
      extraLot,
    },
    FAILURE: { zeni: Math.floor((type.zeni * rules.failRewardPct) / 100), boosters: 0, extraLot: false },
  };
}
