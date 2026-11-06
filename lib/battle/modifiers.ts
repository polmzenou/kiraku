import { activeSynergy } from "./synergy";
import type { BattleSetup, BattleState, Side } from "./types";

// Ce qui fait varier un coup, au même endroit pour le moteur, le bot et l'affichage. Chaque bonus vaut 0
// sur une carte sans le passif : le calcul reste alors identique au chiffre près. Les valeurs des passifs
// ne se lisent qu'une fois le passif constaté, car les parties anciennes ne les ont pas dans leur setup.

/** PV au seuil ou en dessous, en produit croisé (sans flottant). Une carte à terre n'est plus concernée. */
const atOrBelow = (hp: number, maxHp: number, thresholdPct: number) => hp > 0 && hp * 100 <= maxHp * thresholdPct;

/** Bonus d'ATQ de la Rage en %, à `rageThresholdPct` % de PV ou moins. */
export function rageBonusPct(setup: BattleSetup, state: BattleState, side: Side, index: number): number {
  if (!setup.teams[side][index].keywords.includes("RAGE")) return 0;
  const f = state.fighters[side][index];
  const { ragePct, rageThresholdPct } = setup.rules.keywords;
  return atOrBelow(f.hp, f.maxHp, rageThresholdPct) ? ragePct : 0;
}

/** Bonus d'ATQ d'une carte en % : 鼓舞 en cours, synergie active et Rage, additionnés. */
export function atkBonusPct(setup: BattleSetup, state: BattleState, side: Side, index: number): number {
  const f = state.fighters[side][index];
  return (f.buffTurns > 0 ? f.buffPct : 0) + (activeSynergy(setup, state, side)?.atkPct ?? 0) + rageBonusPct(setup, state, side, index);
}

/** Bonus de dégâts de l'Exécution en %, sur une cible à `executeThresholdPct` % de PV ou moins. */
export function executeBonusPct(setup: BattleSetup, state: BattleState, side: Side, actor: number, target: number): number {
  if (!setup.teams[side][actor].keywords.includes("EXECUTE")) return 0;
  const t = state.fighters[side === 0 ? 1 : 0][target];
  const { executePct, executeThresholdPct } = setup.rules.keywords;
  return atOrBelow(t.hp, t.maxHp, executeThresholdPct) ? executePct : 0;
}

/** Dégâts retirés par la Cuirasse en %, sauf contre un coup qui ignore déjà la défense. */
export function armorReductionPct(setup: BattleSetup, side: Side, index: number, ignoreDef: boolean): number {
  if (ignoreDef || !setup.teams[side][index].keywords.includes("ARMOR")) return 0;
  return setup.rules.keywords.armorPct;
}
