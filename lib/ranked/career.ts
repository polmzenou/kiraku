import { BOARD_TIERS, parseBoardTier, type BoardTier } from "@/lib/battle/tiers";
import { ladderTier, type RankedRules } from "./rules";

// Meilleur rang de toute la carrière classée d'un joueur : la saison en cours (pic de points, Grand Champion
// atteint) et les bilans des saisons closes (SeasonResult.peakTier). Sert aux cosmétiques de rang, acquis pour de bon.

export type CareerInput = {
  rankPoints: number;
  seasonPeakPc: number;
  seasonPeakGrand: boolean;
  seasonGames: number;
  /** peakTier des saisons closes ; une valeur inconnue est ignorée. */
  pastPeaks: readonly string[];
};

/** Meilleur rang atteint ; null tant que le joueur n'a jamais joué en classé (Bronze se gagne à la première partie). */
export function careerTier(input: CareerInput, r: Pick<RankedRules, "tiers">): BoardTier | null {
  const past = input.pastPeaks.map(parseBoardTier).filter((t) => t !== null);
  const played = input.seasonGames > 0 || input.pastPeaks.length > 0 || input.rankPoints > 0;
  if (!played) return null;
  const current: BoardTier = input.seasonPeakGrand ? "GRAND_CHAMPION" : ladderTier(Math.max(input.rankPoints, input.seasonPeakPc), r);
  return [current, ...past].reduce((best, t) => (BOARD_TIERS.indexOf(t) > BOARD_TIERS.indexOf(best) ? t : best));
}
