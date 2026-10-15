import { mixSeed, seededRng, type Rng } from "@/lib/rng";
import {
  IllegalAction,
  TECHNIQUE_TARGET,
  type Action,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type EndReason,
  type FighterSetup,
  type FighterState,
  type Keyword,
  type Side,
} from "./types";

// Moteur du combat : fonctions pures et déterministes. Une partie = setup + graine + liste d'actions.
// Le hasard de l'action n° seq vient de seededRng(mixSeed(graine, seq)) : aucun état de générateur à sauvegarder.
// Toute l'arithmétique est entière : le même journal redonne exactement les mêmes chiffres partout.

export function rngFor(seed: number, seq: number): Rng {
  return seededRng(mixSeed(seed, seq));
}

export const other = (side: Side): Side => (side === 0 ? 1 : 0);
const alive = (f: FighterState) => f.hp > 0;
const has = (f: FighterSetup, k: Keyword) => f.keywords.includes(k);

type Ctx = { setup: BattleSetup; state: BattleState; events: BattleEvent[]; rng: Rng };

/** Orbes 気 du tour : start, +perTurn par tour du camp, plafonnés ; le second joueur reçoit un bonus à son premier tour. */
export function orbsFor(turn: number, side: Side, setup: BattleSetup): number {
  const { start, perTurn, max, secondBonus } = setup.rules.orbs;
  const ownTurn = Math.ceil(turn / 2);
  const base = Math.min(max, start + perTurn * (ownTurn - 1));
  return base + (side !== setup.first && ownTurn === 1 ? secondBonus : 0);
}

export function createState(setup: BattleSetup): { state: BattleState; events: BattleEvent[] } {
  const fighters = setup.teams.map((team) =>
    team.map<FighterState>((f) => ({
      hp: f.hp,
      maxHp: f.hp,
      barrier: has(f, "BARRIER"),
      revived: false,
      poisonTurns: 0,
      poisonDmg: 0,
      buffPct: 0,
      buffTurns: 0,
      sealed: false,
      actionsLeft: 0,
    })),
  ) as [FighterState[], FighterState[]];
  const state: BattleState = {
    seq: 0,
    turn: 1,
    active: setup.first,
    orbs: 0,
    budget: null,
    missed: [0, 0],
    fighters,
    finished: false,
    winner: null,
    endReason: null,
  };
  const c: Ctx = { setup, state, events: [], rng: () => 0 };
  startTurn(c);
  return { state, events: c.events };
}

function finish(c: Ctx, winner: Side | null, reason: EndReason) {
  c.state.finished = true;
  c.state.winner = winner;
  c.state.endReason = reason;
  for (const team of c.state.fighters) for (const f of team) f.actionsLeft = 0;
  c.events.push({ t: "end", winner, reason });
}

/** Fin par K.O. si un camp n'a plus de carte debout. */
function checkKo(c: Ctx): boolean {
  if (c.state.finished) return true;
  const down = c.state.fighters.map((team) => team.every((f) => !alive(f)));
  if (!down[0] && !down[1]) return false;
  finish(c, down[0] && down[1] ? null : down[0] ? 1 : 0, "KO");
  return true;
}

function heal(c: Ctx, side: Side, index: number, pct: number) {
  const f = c.state.fighters[side][index];
  const amount = Math.min(f.maxHp - f.hp, Math.ceil((f.maxHp * pct) / 100));
  f.hp += amount;
  c.events.push({ t: "heal", side, index, amount, hp: f.hp });
}

function onKo(c: Ctx, side: Side, index: number) {
  const f = c.state.fighters[side][index];
  const card = c.setup.teams[side][index];
  const k = c.setup.rules.keywords;
  if (has(card, "REVIVE") && !f.revived) {
    f.revived = true;
    f.hp = Math.max(1, Math.ceil((f.maxHp * k.revivePct) / 100));
    f.poisonTurns = 0;
    c.events.push({ t: "revive", side, index, hp: f.hp });
    return;
  }
  Object.assign(f, { hp: 0, actionsLeft: 0, poisonTurns: 0, buffTurns: 0, buffPct: 0, sealed: false, barrier: false });
  c.events.push({ t: "ko", side, index });
  if (has(card, "LAST_WILL") && k.lastWillHealPct > 0) {
    c.state.fighters[side].forEach((ally, j) => {
      if (alive(ally)) heal(c, side, j, k.lastWillHealPct);
    });
  }
}

/** Un coup : ATK × 100 / (100 + DEF) × critique × aléa × mult, au moins 1. */
function hit(c: Ctx, side: Side, actor: number, target: number, multPct: number, ignoreDef: boolean, basic: boolean) {
  const foe = other(side);
  const a = c.state.fighters[side][actor];
  const t = c.state.fighters[foe][target];
  const card = c.setup.teams[side][actor];
  const targetCard = c.setup.teams[foe][target];
  const { damage, keywords } = c.setup.rules;
  if (t.barrier) {
    t.barrier = false;
    c.events.push({ t: "block", side: foe, index: target });
    return;
  }
  // Toujours deux tirages, dans le même ordre : critique puis aléa
  const crit = c.rng(1_000) < damage.critPermille;
  const variance = damage.varianceMinPct + c.rng(damage.varianceMaxPct - damage.varianceMinPct + 1);
  const buff = a.buffTurns > 0 ? a.buffPct : 0;
  const def = ignoreDef ? 0 : targetCard.def;
  const num = card.atk * (100 + buff) * 100 * (crit ? damage.critPct : 100) * variance * multPct;
  const den = (100 + def) * 100_000_000;
  const amount = Math.max(1, Math.floor(num / den));
  t.hp = Math.max(0, t.hp - amount);
  c.events.push({ t: "damage", side: foe, index: target, amount, crit, hp: t.hp });
  if (t.hp > 0 && has(card, "POISON") && keywords.poisonTurns > 0 && keywords.poisonPct > 0) {
    t.poisonTurns = keywords.poisonTurns;
    t.poisonDmg = Math.max(1, Math.ceil((t.maxHp * keywords.poisonPct) / 100));
    c.events.push({ t: "poisoned", side: foe, index: target });
  }
  if (t.hp === 0) {
    onKo(c, foe, target);
    return;
  }
  // 反撃 : seulement contre une attaque simple, sans critique ni aléa
  if (basic && has(targetCard, "RIPOSTE") && keywords.ripostePct > 0 && alive(a)) {
    c.events.push({ t: "riposte", side: foe, index: target });
    if (a.barrier) {
      a.barrier = false;
      c.events.push({ t: "block", side, index: actor });
      return;
    }
    const back = Math.max(1, Math.floor((amount * keywords.ripostePct) / 100));
    a.hp = Math.max(0, a.hp - back);
    c.events.push({ t: "damage", side, index: actor, amount: back, crit: false, hp: a.hp });
    if (a.hp === 0) onKo(c, side, actor);
  }
}

function startTurn(c: Ctx) {
  const { state, setup } = c;
  const side = state.active;
  state.orbs = orbsFor(state.turn, side, setup);
  state.budget = state.turn === 1 ? setup.rules.firstTurnActions : null;
  c.events.push({ t: "turn", side, turn: state.turn, orbs: state.orbs });
  state.fighters[side].forEach((f, i) => {
    if (!alive(f) || f.poisonTurns <= 0) return;
    f.hp = Math.max(0, f.hp - f.poisonDmg);
    f.poisonTurns -= 1;
    c.events.push({ t: "poison", side, index: i, amount: f.poisonDmg, hp: f.hp });
    if (f.hp === 0) onKo(c, side, i);
  });
  if (checkKo(c)) return;
  state.fighters[side].forEach((f, i) => {
    f.actionsLeft = alive(f) && !f.sealed ? (has(setup.teams[side][i], "FLURRY") ? 2 : 1) : 0;
    f.sealed = false;
  });
}

function endTurn(c: Ctx) {
  const { state } = c;
  for (const f of state.fighters[state.active]) {
    f.actionsLeft = 0;
    if (f.buffTurns > 0 && --f.buffTurns === 0) f.buffPct = 0;
  }
  if (state.turn >= c.setup.rules.maxTurns) {
    const o = outcome(c.setup, state);
    // Plus fort % de PV restants, en produit croisé (sans flottant)
    const a = o[0].hpLeft * o[1].hpMax;
    const b = o[1].hpLeft * o[0].hpMax;
    finish(c, a === b ? null : a > b ? 0 : 1, "TURN_LIMIT");
    return;
  }
  state.turn += 1;
  state.active = other(state.active);
  startTurn(c);
}

/** Lève IllegalAction si l'action n'est pas jouable dans cet état. */
export function checkAction(setup: BattleSetup, state: BattleState, action: Action) {
  if (state.finished) throw new IllegalAction("FINISHED");
  if (action.side !== 0 && action.side !== 1) throw new IllegalAction("BAD_SIDE");
  if (action.type === "FORFEIT") return;
  if (action.side !== state.active) throw new IllegalAction("NOT_YOUR_TURN");
  if (action.type === "END_TURN" || action.type === "TIMEOUT") return;

  const mine = state.fighters[action.side];
  const theirs = state.fighters[other(action.side)];
  const valid = (team: FighterState[], i: number | undefined): i is number =>
    Number.isInteger(i) && i! >= 0 && i! < team.length && alive(team[i!]);
  if (!valid(mine, action.actor) || mine[action.actor].actionsLeft <= 0) throw new IllegalAction("ACTOR_UNAVAILABLE");
  if (state.budget !== null && state.budget <= 0) throw new IllegalAction("NO_ACTIONS_LEFT");

  const enemyTarget = (target: number | undefined) => {
    if (!valid(theirs, target)) throw new IllegalAction("BAD_TARGET");
    const foes = setup.teams[other(action.side)];
    const taunts = theirs.some((f, i) => alive(f) && has(foes[i], "TAUNT"));
    if (taunts && !has(foes[target], "TAUNT")) throw new IllegalAction("TAUNT");
  };

  if (action.type === "ATTACK") {
    enemyTarget(action.target);
    return;
  }
  const technique = setup.teams[action.side][action.actor].technique;
  if (setup.rules.techniques[technique].cost > state.orbs) throw new IllegalAction("NOT_ENOUGH_ORBS");
  const kind = TECHNIQUE_TARGET[technique];
  if (kind === "ENEMY") enemyTarget(action.target);
  else if (kind === "ALLY") {
    if (!valid(mine, action.target)) throw new IllegalAction("BAD_TARGET");
  } else if (action.target !== undefined) throw new IllegalAction("BAD_TARGET");
}

function castTechnique(c: Ctx, side: Side, actor: number, target: number | undefined) {
  const technique = c.setup.teams[side][actor].technique;
  const { value } = c.setup.rules.techniques[technique];
  const foe = other(side);
  c.events.push({ t: "attack", side, actor, target: target ?? null, technique });
  switch (technique) {
    case "ISSEN":
      hit(c, side, actor, target!, value, false, false);
      break;
    case "KANTSU":
      hit(c, side, actor, target!, value, true, false);
      break;
    case "RANBU":
      c.state.fighters[foe].forEach((f, i) => {
        if (alive(f) && alive(c.state.fighters[side][actor])) hit(c, side, actor, i, value, false, false);
      });
      break;
    case "IYASHI":
      heal(c, side, target!, value);
      break;
    case "SHUGO":
      c.state.fighters[side][target!].barrier = true;
      c.events.push({ t: "barrier", side, index: target! });
      break;
    case "KOBU":
      for (const f of c.state.fighters[side]) {
        if (!alive(f)) continue;
        f.buffPct = value;
        f.buffTurns = 2; // ce tour-ci et le prochain du camp
      }
      c.events.push({ t: "buff", side, pct: value });
      break;
    case "FUIN":
      c.state.fighters[foe][target!].sealed = true;
      c.events.push({ t: "seal", side: foe, index: target! });
      break;
  }
}

function spend(state: BattleState, side: Side, actor: number) {
  state.fighters[side][actor].actionsLeft -= 1;
  if (state.budget !== null) state.budget -= 1;
}

/** Applique une action légale ; renvoie le nouvel état (l'ancien n'est pas modifié) et les événements à animer. */
export function applyAction(
  setup: BattleSetup,
  seed: number,
  prev: BattleState,
  action: Action,
): { state: BattleState; events: BattleEvent[] } {
  checkAction(setup, prev, action);
  const state = structuredClone(prev);
  const c: Ctx = { setup, state, events: [], rng: rngFor(seed, prev.seq) };
  state.seq = prev.seq + 1;

  switch (action.type) {
    case "FORFEIT":
      c.events.push({ t: "forfeit", side: action.side });
      finish(c, other(action.side), "FORFEIT");
      break;
    case "TIMEOUT":
      c.events.push({ t: "timeout", side: action.side });
      state.missed[action.side] += 1;
      if (state.missed[action.side] >= setup.rules.maxMissedTurns) finish(c, other(action.side), "TIMEOUT");
      else endTurn(c);
      break;
    case "END_TURN":
      state.missed[action.side] = 0;
      endTurn(c);
      break;
    case "ATTACK":
      spend(state, action.side, action.actor);
      c.events.push({ t: "attack", side: action.side, actor: action.actor, target: action.target, technique: null });
      hit(c, action.side, action.actor, action.target, 100, false, true);
      checkKo(c);
      break;
    case "TECHNIQUE": {
      const technique = setup.teams[action.side][action.actor].technique;
      state.orbs -= setup.rules.techniques[technique].cost;
      spend(state, action.side, action.actor);
      castTechnique(c, action.side, action.actor, action.target);
      checkKo(c);
      break;
    }
  }
  return { state, events: c.events };
}

/** Toutes les actions jouables par `side` (hors abandon), fin de tour comprise. */
export function legalActions(setup: BattleSetup, state: BattleState, side: Side): Action[] {
  if (state.finished || state.active !== side) return [];
  const out: Action[] = [];
  const team = state.fighters[side];
  const foes = state.fighters[other(side)];
  const tryPush = (a: Action) => {
    try {
      checkAction(setup, state, a);
      out.push(a);
    } catch {
      // action refusée par les règles
    }
  };
  team.forEach((f, actor) => {
    if (!alive(f) || f.actionsLeft <= 0) return;
    foes.forEach((_, target) => tryPush({ type: "ATTACK", side, actor, target }));
    const kind = TECHNIQUE_TARGET[setup.teams[side][actor].technique];
    if (kind === "NONE") tryPush({ type: "TECHNIQUE", side, actor });
    else (kind === "ENEMY" ? foes : team).forEach((_, target) => tryPush({ type: "TECHNIQUE", side, actor, target }));
  });
  out.push({ type: "END_TURN", side });
  return out;
}

export type SideOutcome = { hpLeft: number; hpMax: number; cardsLost: number };

/** PV restants et cartes perdues par camp (règle « écrasante » du classé). */
export function outcome(setup: BattleSetup, state: BattleState): [SideOutcome, SideOutcome] {
  return state.fighters.map((team, side) => ({
    hpLeft: team.reduce((s, f) => s + f.hp, 0),
    hpMax: setup.teams[side].reduce((s, f) => s + f.hp, 0),
    cardsLost: team.filter((f) => !alive(f)).length,
  })) as [SideOutcome, SideOutcome];
}

export type ReplayStep = { action: Action | null; events: BattleEvent[] };

/** Rejoue une partie entière depuis son journal : même graine + mêmes actions = mêmes événements. */
export function replay(setup: BattleSetup, seed: number, actions: readonly Action[]) {
  let { state, events } = createState(setup);
  const steps: ReplayStep[] = [{ action: null, events }];
  for (const action of actions) {
    ({ state, events } = applyAction(setup, seed, state, action));
    steps.push({ action, events });
  }
  return { state, steps };
}
