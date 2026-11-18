import { cardBonusFor, chancesFromRaw } from "./chance";
import { rewardsByOutcome, type OutcomeRewards } from "./rewards";
import { EXPEDITION_TEAM_SIZE, type CardBonus, type ChanceRules, type ExpeditionRules, type RewardRules } from "./types";

// Aperçu d'équilibrage de l'admin : chances et gains attendus d'un modèle avec l'équipe la plus juste
// (une carte de la rareté exigée, deux cartes très en dessous) et avec l'équipe idéale (trois cartes
// le plus haut possible au-dessus de la rareté exigée).

export type TeamEstimate = {
  success: number;
  triumph: number;
  /** Zeni et boosters attendus (moyenne pondérée des issues). */
  zeni: number;
  boosters: number;
  zeniPerHour: number;
};

export type BalanceEstimate = { minimal: TeamEstimate; ideal: TeamEstimate; rewards: OutcomeRewards };

function estimate(raw: number, rules: ChanceRules, rewards: OutcomeRewards, durationMinutes: number): TeamEstimate {
  const { success, triumph } = chancesFromRaw(raw, rules);
  const p = { TRIUMPH: triumph / 100, SUCCESS: (success - triumph) / 100, FAILURE: (100 - success) / 100 };
  const zeni = p.TRIUMPH * rewards.TRIUMPH.zeni + p.SUCCESS * rewards.SUCCESS.zeni + p.FAILURE * rewards.FAILURE.zeni;
  const boosters = p.TRIUMPH * rewards.TRIUMPH.boosters + p.SUCCESS * rewards.SUCCESS.boosters;
  const hours = Math.max(durationMinutes, 1) / 60;
  return { success, triumph, zeni: Math.round(zeni), boosters: Math.round(boosters * 10) / 10, zeniPerHour: Math.round(zeni / hours) };
}

export function balanceFor(
  type: ChanceRules & RewardRules & { durationMinutes: number },
  rules: Pick<ExpeditionRules, "triumphRewardPct" | "failRewardPct">,
  bonus: CardBonus,
  /** Écart de palier possible au-dessus de la rareté exigée (0 pour XR). */
  headroom: number,
): BalanceEstimate {
  const rewards = rewardsByOutcome(type, rules);
  const minimalRaw = type.baseSuccessPct + cardBonusFor(0, bonus);
  const idealRaw = type.baseSuccessPct + EXPEDITION_TEAM_SIZE * cardBonusFor(Math.min(headroom, 3), bonus);
  return {
    minimal: estimate(minimalRaw, type, rewards, type.durationMinutes),
    ideal: estimate(idealRaw, type, rewards, type.durationMinutes),
    rewards,
  };
}
