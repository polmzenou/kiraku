import type { BattleState } from "./types";

// Anti-farm des récompenses de combat (Zeni et PC du classé), une seule règle pour les deux.

/**
 * Partie abandonnée ou perdue au minuteur avant le tour `minTurn` (battle.rewardMinTurns ; 3 : chaque camp n'a
 * pas encore fini un tour) : le gagnant n'en tire rien, ni Zeni ni PC ; en classé, le partant perd quand même ses PC.
 * Un K.-O. ou la limite de tours comptent toujours : la partie a vraiment été jouée.
 */
export function endedTooEarly(state: Pick<BattleState, "turn" | "endReason">, minTurn: number): boolean {
  return state.turn < minTurn && (state.endReason === "FORFEIT" || state.endReason === "TIMEOUT");
}
