import { RATE_SCALE } from "./draw";

// Chances affichées dans l'admin : « 1 booster sur N » et boosters attendus pour finir une fresque. Sans
// doublon, il faut exactement autant de fragments que de cases ; seule la chance par booster compte.

export type FrescoOdds = {
  /** Un fragment tous les N boosters en moyenne (null si la chute est coupée). */
  oneIn: number | null;
  /** Boosters attendus pour finir une fresque seule en jeu (null si la chute est coupée). */
  boostersToComplete: number | null;
};

export function frescoOdds(rate: number, cells: number, liveFrescoes = 1): FrescoOdds {
  if (rate <= 0) return { oneIn: null, boostersToComplete: null };
  const p = Math.min(RATE_SCALE, rate) / RATE_SCALE;
  // Plusieurs fresques en jeu se partagent les fragments (à poids égaux) : chacune met d'autant plus longtemps
  return { oneIn: Math.round(1 / p), boostersToComplete: Math.round((cells * Math.max(1, liveFrescoes)) / p) };
}
