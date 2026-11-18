import type { BoardTier } from "@/lib/battle/tiers";

// Récap de l'année d'un joueur (Wrapped) : forme des données et règles de calcul pures. Les lectures en
// base sont dans server/wrapped/queries.ts ; le diaporama et l'image ne font qu'afficher ce résumé.

/** Motifs de séquestre : une mise ou un avis bloqué puis rendu n'est ni un gain ni une dépense. */
const HOLDS = { BID_HOLD: "BID", BID_REFUND: "BID", ORDER_HOLD: "ORDER", ORDER_REFUND: "ORDER" } as const;

export type LedgerByReason = { reason: string; gained: number; spent: number };

export type ZeniTotals = {
  /** Zeni reçus dans l'année (hors séquestres rendus). */
  earned: number;
  /** Zeni dépensés (boosters, taxes, enchères gagnées, avis remplis…). */
  spent: number;
  /** Motif qui a rapporté le plus, ou null sans aucun gain. */
  topSource: string | null;
};

/**
 * Gains et dépenses de l'année à partir du journal regroupé par motif (`gained` ≥ 0, `spent` ≥ 0).
 * Un séquestre ne compte que pour ce qu'il n'a pas rendu : une mise dépassée puis remboursée vaut 0,
 * une enchère gagnée vaut son prix.
 */
export function zeniTotals(rows: readonly LedgerByReason[]): ZeniTotals {
  let earned = 0;
  let spent = 0;
  const held = { BID: 0, ORDER: 0 };
  const sources = new Map<string, number>();
  for (const row of rows) {
    const hold = HOLDS[row.reason as keyof typeof HOLDS];
    if (hold) {
      held[hold] += row.gained - row.spent;
      continue;
    }
    earned += row.gained;
    spent += row.spent;
    if (row.gained > 0) sources.set(row.reason, (sources.get(row.reason) ?? 0) + row.gained);
  }
  // Séquestre net négatif : ce qui a été effectivement payé (enchères gagnées, avis remplis)
  spent += Math.max(0, -held.BID) + Math.max(0, -held.ORDER);
  const top = [...sources].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { earned, spent, topSource: top ? top[0] : null };
}

export type FavoriteSource = "battle" | "showcase" | "pull";
export type Favorite = { cardId: string; source: FavoriteSource; battles: number };

/**
 * Carte préférée : la plus alignée en combat (à égalité, la plus ancienne dans la liste), sinon une carte
 * de la vitrine, sinon le plus gros tirage de l'année.
 */
export function pickFavorite(
  battleCounts: readonly { cardId: string; battles: number }[],
  showcaseCardId: string | null,
  bestPullCardId: string | null,
): Favorite | null {
  const top = [...battleCounts].filter((c) => c.battles > 0).sort((a, b) => b.battles - a.battles || (a.cardId < b.cardId ? -1 : 1))[0];
  if (top) return { cardId: top.cardId, source: "battle", battles: top.battles };
  if (showcaseCardId) return { cardId: showcaseCardId, source: "showcase", battles: 0 };
  if (bestPullCardId) return { cardId: bestPullCardId, source: "pull", battles: 0 };
  return null;
}

/** Une carte mise en avant, prête à afficher (fuda, image). */
export type WrappedCard = { cardId: string; anilistId: number; name: string; rarity: string; imageUrl: string;
  /** Personnage qui dévoile l'histoire : jamais son illustration sur l'image partagée. */
  spoiler: boolean };

export type WrappedSummary = {
  year: number;
  username: string;
  boosters: { opened: number; golden: number; divine: number; zeniSpent: number };
  /** Carte la plus rare tirée dans l'année (rang de rareté, puis variante, puis la plus ancienne). */
  bestPull: (WrappedCard & { at: string }) | null;
  /** Cartes tirées par rareté (clé de rareté → nombre), et nouvelles cartes découvertes. */
  pulledByRarity: Record<string, number>;
  discoveries: number;
  zeni: ZeniTotals;
  battles: { played: number; won: number };
  /** Classé de l'année : null sans aucune partie classée. */
  ranked: { played: number; won: number; bestPc: number; tier: BoardTier; division: 1 | 2 | 3 | null } | null;
  favorite: (WrappedCard & { source: FavoriteSource; battles: number }) | null;
};

/** Le joueur a-t-il une année à raconter ? Au moins un booster ouvert. */
export function hasYear(summary: Pick<WrappedSummary, "boosters">): boolean {
  return summary.boosters.opened > 0;
}

/** Part de victoires arrondie au pourcent, null sans partie. */
export function winRate(stats: { played: number; won: number }): number | null {
  return stats.played > 0 ? Math.round((stats.won * 100) / stats.played) : null;
}
