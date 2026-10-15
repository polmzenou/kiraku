import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { Rng } from "@/lib/rng";
import { legalActions, other } from "./engine";
import type { Action, BattleSetup, BattleState, Keyword, Side } from "./types";

// Adversaire de secours quand la file d'attente reste vide : affiché comme bot, équipe différente à chaque fois.

export const BOT_NAMES = ["TENGU", "KITSUNE", "KAPPA", "TANUKI", "ONI", "KARASU", "YUREI", "RONIN"] as const;
export type BotName = (typeof BOT_NAMES)[number];

/** Raretés de l'équipe du bot : celles du joueur, chacune avec une petite chance de monter d'un cran. */
export function botRarities(player: readonly Rarity[], rng: Rng, upgradePct: number): Rarity[] {
  return player.map((r) => {
    const i = RARITIES.indexOf(r);
    return rng(100) < upgradePct && i < RARITIES.length - 1 ? RARITIES[i + 1] : r;
  });
}

const has = (keywords: readonly Keyword[], k: Keyword) => keywords.includes(k);

/** Dégâts moyens (sans critique ni aléa) d'un coup de `actor` sur `target`. */
function expectedDamage(setup: BattleSetup, state: BattleState, side: Side, actor: number, target: number, multPct: number, ignoreDef: boolean) {
  const card = setup.teams[side][actor];
  const f = state.fighters[side][actor];
  const def = ignoreDef ? 0 : setup.teams[other(side)][target].def;
  const buff = f.buffTurns > 0 ? f.buffPct : 0;
  return (((card.atk * (100 + buff)) / (100 + def)) * multPct) / 100;
}

function hitValue(setup: BattleSetup, state: BattleState, side: Side, actor: number, target: number, multPct: number, ignoreDef: boolean, basic: boolean) {
  const foe = other(side);
  const t = state.fighters[foe][target];
  const tc = setup.teams[foe][target];
  if (t.barrier) return 12;
  const d = expectedDamage(setup, state, side, actor, target, multPct, ignoreDef);
  const kills = d >= t.hp;
  let v = Math.min(d, t.hp) + (kills ? 50 + tc.atk / 2 : 0);
  if (kills && has(tc.keywords, "REVIVE") && !t.revived) v -= 30;
  if (basic && !kills && has(tc.keywords, "RIPOSTE")) v -= ((d * setup.rules.keywords.ripostePct) / 100) * 0.6;
  return v;
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
  }
  return v - cost * 4;
}

/** Prochaine action du bot : la meilleure selon scoreAction, ou un coup au hasard (mistakePct %). */
export function botAction(setup: BattleSetup, state: BattleState, side: Side, rng: Rng, mistakePct: number): Action {
  const options = legalActions(setup, state, side).filter((a) => a.type !== "END_TURN");
  if (options.length === 0) return { type: "END_TURN", side };
  if (rng(100) < mistakePct) return options[rng(options.length)];
  let best = options[0];
  let bestScore = -Infinity;
  for (const a of options) {
    const s = scoreAction(setup, state, a);
    if (s > bestScore) [best, bestScore] = [a, s];
  }
  return bestScore > 0 ? best : { type: "END_TURN", side };
}
