import { EXPEDITION_TEAM_SIZE } from "./types";

// Équipes proposées en un geste. « Optimale » : les cartes les plus rares, pour les meilleures chances.
// « Économe » : une seule carte qui remplit la condition (la plus proche de la rareté exigée) et deux cartes
// d'appoint parmi les plus courantes, pour garder ses grandes cartes libres pour le combat et le marché.

export type PoolCard = {
  cardId: string;
  /** Palier de la carte (0 = le plus courant). */
  tier: number;
  /** Rang de popularité (1 = le plus populaire), null hors classement. */
  rank: number | null;
};

export type SuggestMode = "best" | "thrifty";

const byRank = (a: PoolCard, b: PoolCard) =>
  (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.cardId.localeCompare(b.cardId, "en");

/** Trois ids de Card, ou null si le joueur ne peut pas remplir l'expédition. */
export function suggestTeam(pool: readonly PoolCard[], minTier: number, mode: SuggestMode): string[] | null {
  const unique = [...new Map(pool.map((c) => [c.cardId, c])).values()];
  if (unique.length < EXPEDITION_TEAM_SIZE) return null;
  const qualified = unique.filter((c) => c.tier >= minTier);
  if (qualified.length === 0) return null;

  if (mode === "best") {
    const best = [...unique].sort((a, b) => b.tier - a.tier || byRank(a, b));
    return best.slice(0, EXPEDITION_TEAM_SIZE).map((c) => c.cardId);
  }

  const anchor = [...qualified].sort((a, b) => a.tier - b.tier || -byRank(a, b))[0];
  const fillers = unique
    .filter((c) => c.cardId !== anchor.cardId)
    .sort((a, b) => a.tier - b.tier || -byRank(a, b))
    .slice(0, EXPEDITION_TEAM_SIZE - 1);
  return [anchor.cardId, ...fillers.map((c) => c.cardId)];
}
