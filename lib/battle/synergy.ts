import { TEAM_SIZE, type BattleSetup, type BattleState, type Side, type SideSynergy, type UniverseRef } from "./types";

// Synergie d'univers : trois cartes du même univers gagnent un bonus d'ATQ jusqu'à la première vraie
// mort du camp. Partagé par le moteur, le bot, l'affichage et le choix d'équipe.

type SeriesUniverse = {
  id: string;
  titleRomaji: string;
  universeId: string | null;
  universe: { name: string } | null;
};

/** Univers d'une carte : celui de sa série, ou sa série seule quand elle n'est rangée nulle part. */
export function universeOf(series: SeriesUniverse): UniverseRef {
  return { key: series.universeId ?? series.id, name: series.universe?.name ?? series.titleRomaji };
}

/** Synergie d'une équipe complète dont toutes les cartes partagent un univers ; null sinon, ou si le bonus est coupé (0). */
export function teamSynergy(team: readonly { universe?: UniverseRef | null }[], atkPct: number): SideSynergy | null {
  if (atkPct <= 0 || team.length !== TEAM_SIZE) return null;
  const first = team[0].universe;
  if (!first || !team.every((f) => f.universe?.key === first.key)) return null;
  return { key: first.key, name: first.name, atkPct };
}

/** Synergie encore active pour ce camp ; null une fois rompue, ou sur une partie lancée sans synergie. */
export function activeSynergy(setup: BattleSetup, state: BattleState, side: Side): SideSynergy | null {
  return state.synergy?.[side] ? (setup.synergy?.[side] ?? null) : null;
}
