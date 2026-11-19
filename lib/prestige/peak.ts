// Meilleur score d'un cycle, photographié à chaque renaissance (PrestigeCycle.stats) : un joueur qui repart de zéro
// garde les titres, cadres, couleurs de pseudo, thèmes de vitrine et badges qu'il avait gagnés, sans en gagner de
// nouveaux par ce biais.

export type PeakStats = {
  uniqueCards: number;
  /** Cartes distinctes possédées par clé de rareté. */
  byRarity: Record<string, number>;
  /** Séries complétées (ids). */
  completedSeries: string[];
  /** Éditions gravées possédées, sanctuaire compris (absent des photos prises avant d'être compté : 0). */
  printingsOwned: number;
};

const finite = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lit une photo stockée (JSON) ; une valeur illisible ne compte pour rien. */
export function parsePeak(raw: unknown): PeakStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const byRarity: Record<string, number> = {};
  if (r.byRarity && typeof r.byRarity === "object") {
    for (const [k, v] of Object.entries(r.byRarity as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) byRarity[k] = v;
  }
  const completedSeries = Array.isArray(r.completedSeries) ? r.completedSeries.filter((s): s is string => typeof s === "string") : [];
  return { uniqueCards: finite(r.uniqueCards), byRarity, completedSeries, printingsOwned: finite(r.printingsOwned) };
}

/** Le meilleur des deux, rareté par rareté ; les séries complétées s'additionnent. */
export function mergePeak(a: PeakStats, b: PeakStats): PeakStats {
  const byRarity: Record<string, number> = { ...a.byRarity };
  for (const [k, v] of Object.entries(b.byRarity)) byRarity[k] = Math.max(byRarity[k] ?? 0, v);
  return {
    uniqueCards: Math.max(a.uniqueCards, b.uniqueCards),
    byRarity,
    completedSeries: [...new Set([...a.completedSeries, ...b.completedSeries])],
    printingsOwned: Math.max(a.printingsOwned, b.printingsOwned),
  };
}

/** Ce que retiennent les conditions de déblocage : le meilleur du cycle en cours et de chaque cycle passé. */
export function bestOfCycles(current: PeakStats, snapshots: readonly unknown[]): PeakStats {
  return snapshots.reduce<PeakStats>((best, raw) => {
    const peak = parsePeak(raw);
    return peak ? mergePeak(best, peak) : best;
  }, current);
}
