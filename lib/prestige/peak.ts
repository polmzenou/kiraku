// Meilleur score d'un cycle, photographié à chaque renaissance (PrestigeCycle.stats) : un joueur qui repart de zéro
// garde les titres, cadres et thèmes qu'il avait gagnés, sans en gagner de nouveaux par ce biais.

export type PeakStats = {
  uniqueCards: number;
  /** Cartes distinctes possédées par clé de rareté. */
  byRarity: Record<string, number>;
  /** Séries complétées (ids). */
  completedSeries: string[];
};

/** Lit une photo stockée (JSON) ; une valeur illisible ne compte pour rien. */
export function parsePeak(raw: unknown): PeakStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const unique = typeof r.uniqueCards === "number" && Number.isFinite(r.uniqueCards) ? r.uniqueCards : 0;
  const byRarity: Record<string, number> = {};
  if (r.byRarity && typeof r.byRarity === "object") {
    for (const [k, v] of Object.entries(r.byRarity as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) byRarity[k] = v;
  }
  const completedSeries = Array.isArray(r.completedSeries) ? r.completedSeries.filter((s): s is string => typeof s === "string") : [];
  return { uniqueCards: unique, byRarity, completedSeries };
}

/** Le meilleur des deux, rareté par rareté ; les séries complétées s'additionnent. */
export function mergePeak(a: PeakStats, b: PeakStats): PeakStats {
  const byRarity: Record<string, number> = { ...a.byRarity };
  for (const [k, v] of Object.entries(b.byRarity)) byRarity[k] = Math.max(byRarity[k] ?? 0, v);
  return { uniqueCards: Math.max(a.uniqueCards, b.uniqueCards), byRarity, completedSeries: [...new Set([...a.completedSeries, ...b.completedSeries])] };
}
