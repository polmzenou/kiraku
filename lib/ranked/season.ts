import type { BoardTier } from "@/lib/battle/tiers";
import { filterContext } from "@/lib/boosters/pool-filter";
import { localMidnight } from "@/lib/economy/period";
import { ladderTier, type RankedRules } from "./rules";

// Saisons du classé, calées sur le calendrier : elles changent tous les `months` mois, le 1er du
// mois à minuit dans le fuseau du jeu (avec 2 mois : 1er janvier, 1er mars, 1er mai…).

/** Premier changement de saison strictement après `after`. */
export function nextSeasonBoundary(after: Date, months: number, timeZone: string): Date {
  const today = filterContext(after, timeZone);
  let year = today.year;
  let month = today.month;
  for (let i = 0; i < 24; i++) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if ((month - 1) % months === 0) {
      const at = localMidnight({ year, month, day: 1 }, timeZone);
      if (at > after) return at;
    }
  }
  throw new Error("Aucun changement de saison trouvé");
}

/** PC après la remise à zéro : au-dessus du pivot, on n'en garde qu'une part. */
export function resetPc(pc: number, r: Pick<RankedRules, "reset">): number {
  const { pivot, keepPct } = r.reset;
  return pc > pivot ? pivot + Math.floor(((pc - pivot) * keepPct) / 100) : pc;
}

/** Meilleur rang atteint pendant la saison (sert à choisir le lot). */
export function rewardTier(peakPc: number, peakGrand: boolean, r: Pick<RankedRules, "tiers">): BoardTier {
  return peakGrand ? "GRAND_CHAMPION" : ladderTier(peakPc, r);
}
