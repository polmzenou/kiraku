import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { botAction } from "./bot";
import { DEFAULT_BATTLE_RULES, engineRules } from "./config";
import { applyEvent } from "./display";
import { applyAction, createState, replay } from "./engine";
import { FLAT_RULES, fighter, setupOf } from "./fixtures";
import { buildSetup } from "./stats";
import { activeSynergy, atkBonusPct, teamSynergy, universeOf } from "./synergy";
import type { Action, BattleEvent, BattleSetup, BattleState, FighterSetup, Side, UniverseRef } from "./types";

const JJK: UniverseRef = { key: "u-jjk", name: "Jujutsu Kaisen" };
const SYNERGY = { key: JJK.key, name: JJK.name, atkPct: 10 };
type Over = Parameters<typeof fighter>[0];

const trio = (over: Over = {}, universe: UniverseRef = JJK) => [fighter({ universe, ...over }), fighter({ universe, ...over }), fighter({ universe, ...over })];

/** Camp 0 en synergie contre un camp 1 sans univers commun, sans hasard. */
function boosted(mine: FighterSetup[] = trio(), theirs: FighterSetup[] = [fighter(), fighter(), fighter()]): BattleSetup {
  return { ...setupOf(mine, theirs), synergy: [SYNERGY, null] };
}
const play = (setup: BattleSetup, state: BattleState, action: Action, seed = 1) => applyAction(setup, seed, state, action);
const breaks = (events: readonly BattleEvent[]) => events.filter((e) => e.t === "synergy_break");

describe("univers d'une carte", () => {
  it("prend l'univers de la série, ou la série seule quand elle n'est rangée nulle part", () => {
    expect(universeOf({ id: "s1", titleRomaji: "JJK Modulo", universeId: "u1", universe: { name: "Jujutsu Kaisen" } })).toEqual({ key: "u1", name: "Jujutsu Kaisen" });
    expect(universeOf({ id: "s2", titleRomaji: "One Piece", universeId: null, universe: null })).toEqual({ key: "s2", name: "One Piece" });
  });
});

describe("synergie d'une équipe", () => {
  it("demande trois cartes du même univers", () => {
    expect(teamSynergy(trio(), 10)).toEqual(SYNERGY);
    expect(teamSynergy(trio().slice(0, 2), 10)).toBeNull();
    expect(teamSynergy([...trio().slice(0, 2), fighter({ universe: { key: "autre", name: "Autre" } })], 10)).toBeNull();
    expect(teamSynergy([fighter(), fighter(), fighter()], 10)).toBeNull();
  });

  it("deux séries groupées comptent pour un seul univers (même clé)", () => {
    const same = [fighter({ universe: { key: "u1", name: "JJK" } }), fighter({ universe: { key: "u1", name: "JJK" } }), fighter({ universe: { key: "u1", name: "JJK" } })];
    expect(teamSynergy(same, 10)?.key).toBe("u1");
  });

  it("0 % coupe la synergie", () => {
    expect(teamSynergy(trio(), 0)).toBeNull();
  });

  it("buildSetup fige la synergie, pour chaque camp qui y a droit", () => {
    const rules = engineRules(DEFAULT_BATTLE_RULES);
    const setup = buildSetup([trio(), [fighter(), fighter(), fighter()]], { ...rules, synergyAtkPct: 12 }, () => 0, 0);
    expect(setup.synergy).toEqual([{ ...SYNERGY, atkPct: 12 }, null]);
    expect(createState(setup).state.synergy).toEqual([true, false]);
    const both = buildSetup([trio(), trio({}, { key: "u2", name: "Fate" })], rules, () => 0, 0);
    expect(both.synergy?.map((s) => s?.key)).toEqual(["u-jjk", "u2"]);
  });

  it("buildSetup n'écrit rien sans synergie, ni quand le bonus vaut 0 ou manque (ancienne partie)", () => {
    const rules = engineRules(DEFAULT_BATTLE_RULES);
    const plain = buildSetup([[fighter()], [fighter()]], rules, () => 0, 0);
    expect("synergy" in plain).toBe(false);
    expect("synergy" in createState(plain).state).toBe(false);
    expect("synergy" in buildSetup([trio(), trio()], { ...rules, synergyAtkPct: 0 }, () => 0, 0)).toBe(false);
    const old = { ...rules };
    delete old.synergyAtkPct;
    expect("synergy" in buildSetup([trio(), trio()], old, () => 0, 0)).toBe(false);
  });
});

describe("bonus d'attaque", () => {
  const damage = (events: readonly BattleEvent[]) => events.find((e) => e.t === "damage");

  it("s'applique aux coups du camp en synergie, pas à ceux de l'adversaire", () => {
    const setup = boosted(trio({ power: 100 }), [fighter({ power: 100, ki: 100 }), fighter({ ki: 100 }), fighter({ ki: 100 })]);
    const { state } = createState(setup);
    // 100 × 1,10 × 100 / 200 = 55, contre 50 sans le bonus
    expect(damage(play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).events)).toMatchObject({ amount: 55 });
    const after = play(setup, state, { type: "END_TURN", side: 0 }).state;
    const back = play(setup, after, { type: "ATTACK", side: 1, actor: 0, target: 0 }).events;
    expect(damage(back)).toMatchObject({ amount: Math.floor((100 * 100) / (100 + setup.teams[0][0].def)) });
  });

  it("s'additionne à l'encouragement (鼓舞) au lieu de se multiplier", () => {
    const setup = boosted(trio({ power: 100, technique: "KOBU" }), [fighter({ ki: 100 }), fighter({ ki: 100 }), fighter({ ki: 100 })]);
    const state = { ...createState(setup).state, orbs: 5 };
    const pct = setup.rules.techniques.KOBU.value;
    const buffed = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 }).state;
    expect(atkBonusPct(setup, buffed, 0, 1)).toBe(pct + 10);
    expect(damage(play(setup, buffed, { type: "ATTACK", side: 0, actor: 1, target: 0 }).events)).toMatchObject({ amount: Math.floor((100 * (100 + pct + 10)) / 200) });
  });

  it("disparaît à la rupture", () => {
    const setup = boosted(trio({ power: 100, ki: 1, hp: 1 }), [fighter({ power: 100, ki: 100 }), fighter({ ki: 100 }), fighter({ ki: 100 })]);
    let { state } = createState(setup);
    expect(atkBonusPct(setup, state, 0, 1)).toBe(10);
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 }).state;
    expect(activeSynergy(setup, state, 0)).toBeNull();
    expect(atkBonusPct(setup, state, 0, 1)).toBe(0);
  });
});

describe("rupture", () => {
  /** Camp 0 avec une carte à 1 PV, frappée au premier tour du camp 1. */
  const fragile = (over: Over = {}) => boosted([fighter({ universe: JJK, hp: 1, ki: 1, ...over }), fighter({ universe: JJK }), fighter({ universe: JJK })], [fighter({ power: 200 }), fighter(), fighter()]);
  const handOver = (setup: BattleSetup) => play(setup, createState(setup).state, { type: "END_TURN", side: 0 }).state;

  it("un coup mortel rompt la synergie, après le K.-O. et une seule fois", () => {
    const setup = fragile();
    const { state, events } = play(setup, handOver(setup), { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(state.synergy).toEqual([false, false]);
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "ko", "synergy_break"]);
    expect(events.at(-1)).toEqual({ t: "synergy_break", side: 0 });
  });

  it("ne repart jamais et n'est émise qu'une fois, même au second K.-O.", () => {
    const setup = boosted(trio({ hp: 1, ki: 1 }), [fighter({ power: 200 }), fighter({ power: 200 }), fighter()]);
    let state = handOver(setup);
    const first = play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(breaks(first.events)).toHaveLength(1);
    const second = play(setup, first.state, { type: "ATTACK", side: 1, actor: 1, target: 1 });
    expect(breaks(second.events)).toHaveLength(0);
    state = second.state;
    expect(state.synergy).toEqual([false, false]);
  });

  it("un zone qui tue deux cartes d'un coup ne la rompt qu'une fois", () => {
    const setup = boosted(trio({ hp: 1, ki: 1 }), [fighter({ power: 200, technique: "RANBU" }), fighter(), fighter()]);
    const state = { ...handOver(setup), orbs: 5 };
    const { events } = play(setup, state, { type: "TECHNIQUE", side: 1, actor: 0 });
    expect(events.filter((e) => e.t === "ko").length).toBeGreaterThan(1);
    expect(breaks(events)).toHaveLength(1);
  });

  it("le poison qui tue rompt aussi, au début du tour du camp empoisonné", () => {
    const setup = boosted(trio({ hp: 30 }), [fighter({ power: 1, keywords: ["POISON"] }), fighter(), fighter()]);
    let state = handOver(setup);
    state = play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 }).state;
    expect(state.fighters[0][0].poisonTurns).toBeGreaterThan(0);
    // Assez de poison pour tuer d'un tic
    state.fighters[0][0].poisonDmg = 999;
    const { events, state: after } = play(setup, state, { type: "END_TURN", side: 1 });
    expect(events.map((e) => e.t)).toEqual(expect.arrayContaining(["poison", "ko", "synergy_break"]));
    expect(after.synergy).toEqual([false, false]);
  });

  it("une riposte mortelle rompt la synergie de l'attaquant", () => {
    const setup = boosted([fighter({ universe: JJK, power: 100, hp: 1 }), fighter({ universe: JJK }), fighter({ universe: JJK })], [fighter({ ki: 0, hp: 500, keywords: ["RIPOSTE"] }), fighter(), fighter()]);
    const { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events.map((e) => e.t)).toEqual(["attack", "damage", "riposte", "damage", "ko", "synergy_break"]);
    expect(state.synergy).toEqual([false, false]);
  });

  it("une carte sauvée par Renaissance ne rompt rien ; sa vraie mort, si", () => {
    const setup = fragile({ keywords: ["REVIVE"] });
    const saved = play(setup, handOver(setup), { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(saved.events.map((e) => e.t)).toEqual(["attack", "damage", "revive"]);
    expect(saved.state.synergy).toEqual([true, false]);
    const dead = play(setup, { ...saved.state, fighters: [saved.state.fighters[0], saved.state.fighters[1].map((f) => ({ ...f, actionsLeft: 1 }))] }, { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(breaks(dead.events)).toHaveLength(1);
    expect(dead.state.synergy).toEqual([false, false]);
  });

  it("la dernière volonté soigne encore après la rupture", () => {
    const setup = fragile({ keywords: ["LAST_WILL"] });
    const state = handOver(setup);
    state.fighters[0][1].hp = 10;
    const { events } = play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(events.map((e) => e.t).slice(2, 5)).toEqual(["ko", "synergy_break", "heal"]);
  });

  it("une mort dans le camp sans synergie n'émet rien", () => {
    const setup = boosted(trio({ power: 200 }), [fighter({ hp: 1, ki: 1 }), fighter(), fighter()]);
    const { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(breaks(events)).toHaveLength(0);
    expect(state.synergy).toEqual([true, false]);
  });

  it("l'état précédent reste intact (le moteur reste pur)", () => {
    const setup = fragile();
    const before = handOver(setup);
    play(setup, before, { type: "ATTACK", side: 1, actor: 0, target: 0 });
    expect(before.synergy).toEqual([true, false]);
  });
});

describe("déterminisme et affichage", () => {
  /** Partie complète bot contre bot : les mêmes coups redonnent les mêmes événements. */
  function game(setup: BattleSetup, seed: number) {
    const rng = seededRng(seed ^ 0x77);
    let { state } = createState(setup);
    const actions: Action[] = [];
    const shown: BattleState[] = [];
    for (let i = 0; !state.finished && i < 2_000; i++) {
      const action = botAction(setup, state, state.active, rng, 25);
      const res = applyAction(setup, seed, state, action);
      shown.push(res.events.reduce(applyEvent, state));
      actions.push(action);
      state = res.state;
      expect(shown.at(-1)?.synergy).toEqual(state.synergy);
    }
    return { state, actions };
  }
  const full = () => [fighter({ universe: JJK, technique: "RANBU" }), fighter({ universe: JJK, keywords: ["REVIVE"] }), fighter({ universe: JJK, technique: "KOBU" })];

  it("rejouer une partie à synergie redonne les mêmes chiffres, et l'affichage suit l'état", () => {
    for (let seed = 0; seed < 25; seed++) {
      const setup: BattleSetup = { ...setupOf(full(), full(), FLAT_RULES, (seed % 2) as Side), synergy: [SYNERGY, SYNERGY] };
      const { state, actions } = game(setup, seed);
      expect(state.finished).toBe(true);
      const again = replay(setup, seed, actions);
      expect(again.state).toEqual(state);
    }
  });

  it("une partie sans synergie n'en porte aucune trace dans son état", () => {
    const setup = setupOf([fighter(), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const { state } = game(setup, 3);
    expect("synergy" in state).toBe(false);
    expect(activeSynergy(setup, state, 0)).toBeNull();
  });
});
