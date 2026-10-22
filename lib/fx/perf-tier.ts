// Niveau d'effets en mode « auto ». Un navigateur ne donne ni le modèle ni la vitesse du processeur :
// on mesure ce qui compte vraiment, la régularité des images affichées, et les indices matériels
// (cœurs, mémoire, économie de données) ne servent qu'à trancher quand rien n'a encore été mesuré.

export type FxTier = "full" | "lite";

/** Une mesure reste valable deux semaines, puis l'appareil est mesuré de nouveau. */
export const TIER_MAX_AGE_MS = 14 * 24 * 3_600_000;
/** Part d'images en retard au-delà de laquelle on allège les effets. */
export const DROPPED_LIMIT = 0.2;
/** Images nécessaires pour juger (environ une seconde à 60 Hz). */
export const MIN_FRAMES = 45;
/**
 * Cadence de référence au-delà de laquelle on ne juge pas (ms, moins de 20 images/s) : c'est le
 * navigateur qui bride la page (onglet ou panneau en arrière-plan), pas l'appareil qui rame.
 */
export const THROTTLED_FRAME_MS = 50;

export type DeviceHints = { cores?: number; memory?: number; saveData?: boolean };

/** Indices matériels : seuls les appareils clairement modestes passent en allégé d'emblée. */
export function tierFromHints({ cores, memory, saveData }: DeviceHints): FxTier | null {
  if (saveData) return "lite";
  if ((cores !== undefined && cores > 0 && cores <= 2) || (memory !== undefined && memory > 0 && memory <= 2)) return "lite";
  return null;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Écarts entre deux images (ms). La cadence de référence est la médiane, ce qui vaut pour un écran
 * 60, 90 ou 120 Hz comme pour un iPhone bridé à 30 Hz : une image est « en retard » quand elle
 * dépasse 1,5 fois cette cadence. Renvoie null si la mesure est trop courte, ou si la page est bridée.
 */
export function droppedShare(deltas: readonly number[]): number | null {
  const usable = deltas.filter((d) => d > 0 && d < 1_000);
  if (usable.length < MIN_FRAMES) return null;
  const base = median(usable);
  if (base > THROTTLED_FRAME_MS) return null;
  return usable.filter((d) => d > base * 1.5).length / usable.length;
}

export function tierFromFrames(deltas: readonly number[]): FxTier | null {
  const share = droppedShare(deltas);
  if (share === null) return null;
  return share > DROPPED_LIMIT ? "lite" : "full";
}

/** Mesure mémorisée sur l'appareil : `{ tier, at }`, ignorée si illisible ou trop ancienne. */
export function readStoredTier(raw: string | null, now: number): FxTier | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { tier?: unknown; at?: unknown };
    if ((value.tier !== "full" && value.tier !== "lite") || typeof value.at !== "number") return null;
    if (now - value.at > TIER_MAX_AGE_MS || value.at > now) return null;
    return value.tier;
  } catch {
    return null;
  }
}

export function storedTier(tier: FxTier, now: number): string {
  return JSON.stringify({ tier, at: now });
}
