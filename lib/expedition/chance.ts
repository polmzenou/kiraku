import { tierDelta } from "./tiers";
import { EXPEDITION_TEAM_SIZE, type CardBonus, type ChanceRules } from "./types";

// Chances d'une équipe : base du modèle + bonus de chaque carte selon son écart de palier avec la rareté
// exigée. La réussite plafonne à maxSuccessPct ; le surplus devient une chance de triomphe (plafonnée).
// Calcul en pourcentages entiers : le client l'affiche en direct, le serveur le refait au lancement.

type Ordered = { key: string; sortOrder: number };

export type TeamCard = { cardId: string; rarity: string };

export type CardContribution = { cardId: string; delta: number; bonus: number };

export type TeamChances = {
  /** Base + bonus, avant plafond. */
  raw: number;
  /** Réussite en %, triomphe compris. */
  success: number;
  /** Triomphe en %, inclus dans `success`. */
  triumph: number;
  /** Au moins une carte de la rareté exigée (ou mieux). */
  qualifies: boolean;
  breakdown: CardContribution[];
};

/** Points de chance d'une carte selon son écart de palier (même palier = 0). */
export function cardBonusFor(delta: number, bonus: CardBonus): number {
  if (delta >= 3) return bonus.above3;
  if (delta === 2) return bonus.above2;
  if (delta === 1) return bonus.above1;
  if (delta === 0) return bonus.same;
  if (delta === -1) return bonus.below1;
  if (delta === -2) return bonus.below2;
  return 0;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Réussite et triomphe à partir du total brut (base + bonus). */
export function chancesFromRaw(raw: number, rules: Pick<ChanceRules, "maxSuccessPct" | "maxTriumphPct">) {
  const success = clamp(Math.min(raw, rules.maxSuccessPct), 0, 100);
  const triumph = clamp(Math.min(raw - rules.maxSuccessPct, rules.maxTriumphPct), 0, success);
  return { success, triumph };
}

export function teamChances(
  cards: readonly TeamCard[],
  rules: ChanceRules,
  bonus: CardBonus,
  definitions: readonly Ordered[],
): TeamChances {
  const breakdown = cards.map((c) => {
    const delta = tierDelta(c.rarity, rules.minRarity, definitions);
    return { cardId: c.cardId, delta, bonus: cardBonusFor(delta, bonus) };
  });
  const raw = rules.baseSuccessPct + breakdown.reduce((sum, c) => sum + c.bonus, 0);
  return { raw, ...chancesFromRaw(raw, rules), qualifies: breakdown.some((c) => c.delta >= 0), breakdown };
}

export type TeamError = "TEAM_SIZE" | "DUPLICATE";

/** Forme de l'équipe : exactement 3 personnages différents. */
export function checkTeam(cardIds: readonly string[]): TeamError | null {
  if (cardIds.length !== EXPEDITION_TEAM_SIZE) return "TEAM_SIZE";
  if (new Set(cardIds).size !== cardIds.length) return "DUPLICATE";
  return null;
}

/** Pourcentage entier → points de base (stockage et tirage). */
export const toBasisPoints = (pct: number) => Math.round(pct * 100);
