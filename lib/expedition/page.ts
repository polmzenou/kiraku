import { balanceFor } from "./balance";
import { teamChances, type TeamCard } from "./chance";
import type { RewardBundle } from "./rewards";
import type { LotGrantSummary } from "./snapshot";
import { headroom, tierOf } from "./tiers";
import { EXPEDITION_TEAM_SIZE, type ChanceRules, type ExpeditionRules, type RewardRules } from "./types";
import type { OfferState } from "./view";

// Composition de la page /expedition (server/expedition/queries.ts), en logique pure testée sans base : état d'une
// offre, fourchette de réussite d'un laissez-passer, gains d'une ligne du journal.

type Ordered = { key: string; sortOrder: number };

/** État d'une offre du jour. Déjà jouée, elle le reste, même si l'admin désactive son modèle ensuite. */
export function offerState(type: { active: boolean; minDiscoveryPct: number }, played: boolean, discoveryPct: number): OfferState {
  if (played) return "DONE";
  if (!type.active) return "UNAVAILABLE";
  return discoveryPct < type.minDiscoveryPct ? "LOCKED" : "OPEN";
}

/**
 * Fourchette d'un laissez-passer : l'équipe la plus juste (une carte de la rareté exigée, deux très en dessous),
 * puis la meilleure équipe que le joueur peut vraiment aligner (l'équipe « optimale » proposée, tirée de ses cartes
 * libres), et non trois cartes de son meilleur palier qu'il n'a souvent qu'en un exemplaire.
 */
export function successRange(
  type: ChanceRules & RewardRules & { durationMinutes: number },
  rules: Pick<ExpeditionRules, "cardBonus" | "triumphRewardPct" | "failRewardPct">,
  definitions: readonly Ordered[],
  bestTeam: readonly TeamCard[] | null,
): { min: number; max: number } {
  const min = balanceFor(type, rules, rules.cardBonus, headroom(type.minRarity, definitions)).minimal.success;
  const best = bestTeam ? teamChances(bestTeam, type, rules.cardBonus, definitions) : null;
  return { min, max: best?.qualifies ? Math.max(min, best.success) : min };
}

/**
 * Meilleure équipe que le joueur peut aligner, en raretés : ses trois cartes libres (distinctes) des paliers les
 * plus hauts, comme l'équipe « optimale » proposée. null s'il n'a pas trois cartes. Les ids sont factices : seules
 * les raretés comptent pour les chances.
 */
export function topTeam(free: readonly { rarity: string; cards: number }[], definitions: readonly Ordered[]): TeamCard[] | null {
  const ranked = free
    .flatMap((f) => {
      const tier = tierOf(f.rarity, definitions);
      return tier === null || f.cards <= 0 ? [] : [{ rarity: f.rarity, cards: f.cards, tier }];
    })
    .sort((a, b) => b.tier - a.tier);
  const team: TeamCard[] = [];
  for (const f of ranked) {
    for (let i = 0; i < f.cards && team.length < EXPEDITION_TEAM_SIZE; i++) team.push({ cardId: `${f.rarity}:${i}`, rarity: f.rarity });
  }
  return team.length === EXPEDITION_TEAM_SIZE ? team : null;
}

/** Gains d'une ligne du journal : ceux de l'issue (photo), plus le lot bonus réellement versé. Abandon : rien. */
export function historyGains(reward: RewardBundle | null, lot: LotGrantSummary | null, cards: number): { zeni: number; boosters: number; cards: number } {
  if (!reward) return { zeni: 0, boosters: 0, cards: 0 };
  return {
    zeni: reward.zeni + (lot?.zeni ?? 0),
    boosters: reward.boosters + (lot?.boosters.reduce((n, b) => n + b.count, 0) ?? 0),
    cards,
  };
}
