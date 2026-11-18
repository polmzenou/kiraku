import type { ZeniTier } from "./zeni";

// Réglages du prestige (GameSetting prestige.*), réunis pour le cœur serveur et les écrans.

export type PrestigeRules = {
  enabled: boolean;
  /** % des cartes publiées exigé par rareté (0 ou absent : la rareté ne compte pas). */
  requiredPercent: Record<string, number>;
  keepSlots: number;
  minDaysBetween: number;
  /** Exemplaires au plus dans la collection au moment de renaître (au-delà : recycler d'abord ses doublons). */
  maxCopies: number;
  heritageMax: number;
  consecrateMinOwnCycles: number;
  zeniTiers: ZeniTier[];
  zeniCap: number;
  /** Une gravée recyclée vaut ce multiple de sa rareté (renaissance comprise). */
  recycleMultiplier: number;
};

const DAY_MS = 24 * 3_600_000;

/** Fin du délai entre deux renaissances, ou null si le joueur peut renaître maintenant. */
export function nextRebirthAt(prestigedAt: Date | null, minDaysBetween: number, now: Date): Date | null {
  if (!prestigedAt || minDaysBetween <= 0) return null;
  const at = new Date(prestigedAt.getTime() + minDaysBetween * DAY_MS);
  return at > now ? at : null;
}
