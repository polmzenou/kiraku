import type { BattleSeed } from "./engine";

// Ce qu'un joueur reçoit d'une partie (server/battle/queries.ts) : rien qui annonce les coups suivants tant qu'elle se joue.

/** Hasard envoyé au navigateur pour la rediffusion : seulement une fois la partie terminée (clé v2, ou graine v1) ; 0 avant. */
export function replaySeed(b: { status: string; seed: number; rngKey: string | null }): BattleSeed {
  return b.status === "FINISHED" ? (b.rngKey ?? b.seed) : 0;
}

type QueueMode = "EXHIBITION" | "RANKED";

/**
 * « Relancer » en fin de partie : mode de file et exemplaires engagés par ce joueur. Null si la partie n'est pas
 * terminée, si c'est une partie entre amis, ou s'il n'y a pas joué.
 */
export function requeueTeam(
  b: { mode: QueueMode | "FRIEND"; status: string; p1Id: string; p2Id: string | null; p1Team: string[]; p2Team: string[] },
  userId: string,
): { mode: QueueMode; team: string[] } | null {
  if (b.status !== "FINISHED" || b.mode === "FRIEND") return null;
  const team = b.p1Id === userId ? b.p1Team : b.p2Id === userId ? b.p2Team : null;
  return team ? { mode: b.mode, team } : null;
}
