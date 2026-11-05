import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { Rng } from "@/lib/rng";
import { legalActions, other } from "./engine";
import { armorReductionPct, atkBonusPct, executeBonusPct } from "./modifiers";
import type { Action, BattleSetup, BattleState, Keyword, Side } from "./types";

// Adversaire de secours quand la file d'attente reste vide : affiché comme bot, équipe différente à chaque fois.

export const BOT_NAMES = ["TENGU", "KITSUNE", "KAPPA", "TANUKI", "ONI", "KARASU", "YUREI", "RONIN"] as const;
export type BotName = (typeof BOT_NAMES)[number];

/** Raretés de l'équipe du bot : celles du joueur, chacune avec une petite chance de monter d'un cran. */
export function botRarities(player: readonly Rarity[], rng: Rng, upgradePct: number, order: readonly Rarity[] = RARITIES): Rarity[] {
  return player.map((r) => {
    const i = order.indexOf(r);
    return rng(100) < upgradePct && i >= 0 && i < order.length - 1 ? order[i + 1] : r;
  });
}

const has = (keywords: readonly Keyword[], k: Keyword) => keywords.includes(k);

/** Dégâts moyens (sans critique ni aléa) d'un coup de `actor` sur `target`. */
function expectedDamage(setup: BattleSetup, state: BattleState, side: Side, actor: number, target: number, multPct: number, ignoreDef: boolean) {
  const card = setup.teams[side][actor];
  const foe = other(side);
  const def = ignoreDef ? 0 : setup.teams[foe][target].def;
  const damage = (((card.atk * (100 + atkBonusPct(setup, state, side, actor))) / (100 + def)) * multPct) / 100;
  const execute = executeBonusPct(setup, state, side, actor, target);
  const armor = armorReductionPct(setup, foe, target, ignoreDef);
  // Sans ces passifs, le calcul ne passe pas par une division de plus : le bot joue les mêmes coups qu'avant
  return execute === 0 && armor === 0 ? damage : (damage * (100 + execute) * (100 - armor)) / 10_000;
}

function hitValue(setup: BattleSetup, state: BattleState, side: Side, actor: number, target: number, multPct: number, ignoreDef: boolean, basic: boolean, barrierDown = false) {
  const foe = other(side);
  const t = state.fighters[foe][target];
  const tc = setup.teams[foe][target];
  if (t.barrier && !barrierDown) return 12;
  const d = expectedDamage(setup, state, side, actor, target, multPct, ignoreDef);
  const kills = d >= t.hp;
  let v = Math.min(d, t.hp) + (kills ? 50 + tc.atk / 2 : 0);
  if (kills && has(tc.keywords, "REVIVE") && !t.revived) v -= 30;
  if (basic && !kills && has(tc.keywords, "RIPOSTE")) v -= ((d * setup.rules.keywords.ripostePct) / 100) * 0.6;
  return v;
}

/**
 * Méditer ne vaut que si un allié peut ensuite payer une technique hors de portée sans ces orbes, et si
 * elle rapporte plus que les deux coups auxquels on renonce : celui de la carte et celui de l'allié. Le
 * score est alors celui de la technique, assez haut pour méditer avant que l'allié ait agi.
 */
function meditationValue(setup: BattleSetup, state: BattleState, actor: number, side: Side, gain: number): number {
  const after: BattleState = { ...state, orbs: state.orbs + gain, budget: state.budget === null ? null : state.budget - 1 };
  const actions = legalActions(setup, after, side);
  const attackOf = (card: number) => Math.max(0, ...actions.flatMap((a) => (a.type === "ATTACK" && a.actor === card ? [scoreAction(setup, after, a)] : [])));
  const own = Math.max(0, ...legalActions(setup, state, side).flatMap((a) => (a.type === "ATTACK" && a.actor === actor ? [scoreAction(setup, state, a)] : [])));
  let best = 0;
  for (const action of actions) {
    if (action.type !== "TECHNIQUE" || action.actor === actor) continue;
    const technique = setup.teams[side][action.actor].technique;
    if (technique === "MEISO" || setup.rules.techniques[technique].cost <= state.orbs) continue;
    const value = scoreAction(setup, after, action);
    if (value > attackOf(action.actor) + own) best = Math.max(best, value);
  }
  return best;
}

/** Valeur estimée d'une action pour le bot (plus c'est haut, mieux c'est). */
export function scoreAction(setup: BattleSetup, state: BattleState, a: Action): number {
  if (a.type === "ATTACK") return hitValue(setup, state, a.side, a.actor, a.target, 100, false, true);
  if (a.type !== "TECHNIQUE") return 0;
  const side = a.side;
  const foe = other(side);
  const technique = setup.teams[side][a.actor].technique;
  const { cost, value } = setup.rules.techniques[technique];
  const allies = state.fighters[side];
  let v = 0;
  switch (technique) {
    case "ISSEN":
      v = hitValue(setup, state, side, a.actor, a.target!, value, false, false);
      break;
    case "KANTSU":
      v = hitValue(setup, state, side, a.actor, a.target!, value, true, false);
      break;
    case "RANBU":
      state.fighters[foe].forEach((f, i) => {
        if (f.hp > 0) v += hitValue(setup, state, side, a.actor, i, value, false, false);
      });
      break;
    case "IYASHI": {
      const f = allies[a.target!];
      v = Math.min(f.maxHp - f.hp, Math.ceil((f.maxHp * value) / 100)) * 1.1;
      break;
    }
    case "SHUGO":
      v = allies[a.target!].barrier ? 0 : 30;
      break;
    case "KOBU":
      allies.forEach((f, i) => {
        if (f.hp > 0) v += ((setup.teams[side][i].atk * value) / 100) * 1.5;
      });
      break;
    case "FUIN": {
      const t = state.fighters[foe][a.target!];
      v = t.sealed ? 0 : setup.teams[foe][a.target!].atk * 0.8;
      break;
    }
    case "KONSHIN":
      // Le tour perdu vaut ce que rapporterait un sceau posé sur soi
      v = hitValue(setup, state, side, a.actor, a.target!, value, false, false) - setup.teams[side][a.actor].atk * 0.8;
      break;
    case "RENGEKI":
      // Une Barrière n'absorbe que le premier coup ; sinon, les deux comptent ensemble pour achever la cible
      v = state.fighters[foe][a.target!].barrier
        ? 12 + hitValue(setup, state, side, a.actor, a.target!, value, false, false, true)
        : hitValue(setup, state, side, a.actor, a.target!, value * 2, false, false);
      break;
    case "JIU":
      allies.forEach((f) => {
        if (f.hp > 0) v += Math.min(f.maxHp - f.hp, Math.ceil((f.maxHp * value) / 100)) * 1.1;
      });
      break;
    case "DOKUGIRI":
      state.fighters[foe].forEach((f) => {
        if (f.hp <= 0) return;
        if (f.barrier) v += 12;
        else if (f.poisonTurns === 0) v += Math.ceil((f.maxHp * value) / 100) * setup.rules.keywords.poisonTurns;
      });
      break;
    case "MEISO":
      v = meditationValue(setup, state, a.actor, side, value);
      break;
    default: {
      const unhandled: never = technique;
      throw new Error(`technique inconnue : ${String(unhandled)}`);
    }
  }
  return v - cost * 4;
}

/** Prochaine action du bot : la meilleure selon scoreAction, ou un coup au hasard (mistakePct %). */
export function botAction(setup: BattleSetup, state: BattleState, side: Side, rng: Rng, mistakePct: number): Action {
  const options = legalActions(setup, state, side).filter((a) => a.type !== "END_TURN");
  if (options.length === 0) return { type: "END_TURN", side };
  if (rng(100) < mistakePct) {
    // Une erreur reste un coup plausible : méditer sans qu'aucun allié en profite ne serait qu'une action jetée
    const plausible = options.filter((a) => a.type !== "TECHNIQUE" || setup.teams[a.side][a.actor].technique !== "MEISO" || scoreAction(setup, state, a) > 0);
    return plausible[rng(plausible.length)] ?? { type: "END_TURN", side };
  }
  let best = options[0];
  let bestScore = -Infinity;
  for (const a of options) {
    const s = scoreAction(setup, state, a);
    if (s > bestScore) [best, bestScore] = [a, s];
  }
  return bestScore > 0 ? best : { type: "END_TURN", side };
}
