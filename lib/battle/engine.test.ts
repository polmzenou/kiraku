import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { botGame, randomTeam } from "./bot-games";
import { applyAction, createState, legalActions, orbsFor, replay } from "./engine";
import { FLAT_RULES, RULES, fighter, setupOf } from "./fixtures";
import type { Action, BattleSetup, BattleState, Side } from "./types";

const play = (setup: BattleSetup, state: BattleState, action: Action, seed = 1) => applyAction(setup, seed, state, action);

function team3(over: Parameters<typeof fighter>[0] = {}) {
  return [fighter(over), fighter(over), fighter(over)];
}

describe("dégâts (formule du plan)", () => {
  it("ATK × 100 / (100 + DEF), sans hasard", () => {
    const setup = setupOf([fighter({ power: 80 })], [fighter({ ki: 60 })]);
    const { state } = createState(setup);
    const { events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 50, crit: false })); // 80 × 100 / 160
  });

  it("au moins 1 dégât, même contre une énorme défense", () => {
    const setup = setupOf([fighter({ power: 1 })], [fighter({ ki: 999 })]);
    const { events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events.find((e) => e.t === "damage")).toMatchObject({ amount: 1 });
  });

  it("reste dans les bornes de l'aléa et du critique", () => {
    const setup = setupOf([fighter({ power: 100 })], [fighter({ ki: 100 })], RULES);
    const base = 50; // 100 × 100 / 200
    for (let seed = 0; seed < 2_000; seed++) {
      const { events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed);
      const d = events.find((e) => e.t === "damage")!;
      if (d.t !== "damage") throw new Error();
      const lo = Math.floor(base * 0.9 * (d.crit ? 1.5 : 1));
      const hi = Math.floor(base * 1.1 * (d.crit ? 1.5 : 1));
      expect(d.amount).toBeGreaterThanOrEqual(lo);
      expect(d.amount).toBeLessThanOrEqual(hi);
    }
  });

  it("environ 10 % de critiques sur 10 000 graines", () => {
    const setup = setupOf([fighter()], [fighter()], RULES);
    const start = createState(setup).state;
    let crits = 0;
    for (let seed = 0; seed < 10_000; seed++) {
      const { events } = play(setup, start, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed);
      if (events.some((e) => e.t === "damage" && e.crit)) crits++;
    }
    expect(crits).toBeGreaterThan(900);
    expect(crits).toBeLessThan(1_100);
  });
});

describe("tours et orbes 気", () => {
  it("1 orbe, +1 par tour du camp, plafond 5, +1 au premier tour du second joueur", () => {
    const setup = setupOf([fighter()], [fighter()], RULES, 0);
    expect([1, 2, 3, 4, 5, 6].map((turn) => orbsFor(turn, (turn % 2 === 1 ? 0 : 1) as Side, setup))).toEqual([1, 2, 2, 2, 3, 3]);
    expect(orbsFor(19, 0, setup)).toBe(5);
  });

  it("une action par carte et par tour, deux avec 疾風", () => {
    const setup = setupOf([fighter(), fighter({ keywords: ["FLURRY"] })], [fighter({ ki: 999 }), fighter({ ki: 999 })]);
    let { state } = createState(setup);
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
  });

  it("premier tour du premier joueur : limité à firstTurnActions actions, puis plus aucune limite", () => {
    const setup = setupOf(team3(), team3({ ki: 999 }), { ...FLAT_RULES, firstTurnActions: 2 });
    let { state } = createState(setup);
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    state = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }).state;
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 2, target: 0 })).toThrow("NO_ACTIONS_LEFT");
    expect(legalActions(setup, state, 0)).toEqual([{ type: "END_TURN", side: 0 }]);
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.budget).toBeNull();
    for (const actor of [0, 1, 2]) state = play(setup, state, { type: "ATTACK", side: 1, actor, target: 0 }).state;
  });

  it("refuse de jouer hors de son tour, une carte morte, une cible invalide, une technique trop chère", () => {
    const setup = setupOf(team3({ technique: "RANBU" }), team3());
    const { state } = createState(setup);
    expect(() => play(setup, state, { type: "ATTACK", side: 1, actor: 0, target: 0 })).toThrow("NOT_YOUR_TURN");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 5, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 3 })).toThrow("BAD_TARGET");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0.5, target: 0 })).toThrow("ACTOR_UNAVAILABLE");
    expect(() => play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 })).toThrow("NOT_ENOUGH_ORBS");
  });

  it("fin de tour : l'autre camp joue, orbes non dépensés perdus", () => {
    const setup = setupOf(team3(), team3());
    const { state, events } = play(setup, createState(setup).state, { type: "END_TURN", side: 0 });
    expect(state.active).toBe(1);
    expect(state.turn).toBe(2);
    expect(state.orbs).toBe(2);
    expect(events).toContainEqual({ t: "turn", side: 1, turn: 2, orbs: 2 });
    expect(state.fighters[1].every((f) => f.actionsLeft === 1)).toBe(true);
  });

  it("l'état précédent n'est jamais modifié", () => {
    const setup = setupOf(team3(), team3());
    const start = createState(setup).state;
    const copy = structuredClone(start);
    play(setup, start, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(start).toEqual(copy);
  });
});

describe("fins de partie", () => {
  it("K.O. : le camp qui n'a plus de carte debout perd", () => {
    const setup = setupOf([fighter({ power: 999 })], [fighter({ ki: 0, power: 1 })]);
    const { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "KO" });
    expect(events.at(-1)).toEqual({ t: "end", winner: 0, reason: "KO" });
    expect(() => play(setup, state, { type: "END_TURN", side: 1 })).toThrow("FINISHED");
  });

  it("abandon à tout moment, même hors de son tour", () => {
    const setup = setupOf(team3(), team3());
    const { state } = play(setup, createState(setup).state, { type: "FORFEIT", side: 1 });
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "FORFEIT" });
  });

  it("tours expirés : fin de tour automatique, forfait au 2e d'affilée ; un vrai tour remet le compteur à zéro", () => {
    const setup = setupOf(team3(), team3());
    let { state } = createState(setup);
    state = play(setup, state, { type: "TIMEOUT", side: 0 }).state;
    expect(state).toMatchObject({ active: 1, missed: [1, 0], finished: false });
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.missed).toEqual([0, 0]);
    state = play(setup, state, { type: "TIMEOUT", side: 1 }).state;
    state = play(setup, state, { type: "TIMEOUT", side: 0 }).state;
    state = play(setup, state, { type: "TIMEOUT", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "TIMEOUT" });
  });

  it("limite de tours : le plus fort % de PV gagne, égalité = nul", () => {
    const rules = { ...FLAT_RULES, maxTurns: 2 };
    const even = setupOf(team3(), team3(), rules);
    let { state } = createState(even);
    state = play(even, state, { type: "END_TURN", side: 0 }).state;
    state = play(even, state, { type: "END_TURN", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: null, endReason: "TURN_LIMIT" });

    const uneven = setupOf(team3(), team3(), rules);
    state = createState(uneven).state;
    state = play(uneven, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }).state;
    state = play(uneven, state, { type: "END_TURN", side: 0 }).state;
    state = play(uneven, state, { type: "END_TURN", side: 1 }).state;
    expect(state).toMatchObject({ finished: true, winner: 0, endReason: "TURN_LIMIT" });
  });
});

describe("mots-clés", () => {
  it("挑発 : les attaques doivent viser la provocation tant qu'elle vit", () => {
    const setup = setupOf(team3(), [fighter(), fighter({ keywords: ["TAUNT"] }), fighter()]);
    const { state } = createState(setup);
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 })).toThrow("TAUNT");
    expect(() => play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 1 })).not.toThrow();
    const targets = legalActions(setup, state, 0).filter((a) => a.type === "ATTACK").map((a) => a.type === "ATTACK" && a.target);
    expect(new Set(targets)).toEqual(new Set([1]));
  });

  it("結界 : le premier coup est annulé, le suivant passe", () => {
    const setup = setupOf(team3(), [fighter({ keywords: ["BARRIER"] }), fighter(), fighter()]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "block", side: 1, index: 0 });
    expect(state.fighters[1][0].hp).toBe(state.fighters[1][0].maxHp);
    ({ state, events } = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 }));
    expect(state.fighters[1][0].hp).toBeLessThan(state.fighters[1][0].maxHp);
  });

  it("毒 : le poison retire 8 % des PV max au début des 2 tours suivants de la cible", () => {
    const setup = setupOf([fighter({ keywords: ["POISON"] })], [fighter({ ki: 50 })]); // 160 PV → 13 par tour
    let { state } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const afterHit = state.fighters[1][0].hp;
    const tick = play(setup, state, { type: "END_TURN", side: 0 });
    state = tick.state;
    expect(tick.events).toContainEqual({ t: "poison", side: 1, index: 0, amount: 13, hp: afterHit - 13 });
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1][0].hp).toBe(afterHit - 26);
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1][0].hp).toBe(afterHit - 26);
  });

  it("反撃 : renvoie 50 % des dégâts d'une attaque simple, pas d'une technique", () => {
    const setup = setupOf([fighter({ power: 80, technique: "ISSEN" })], [fighter({ ki: 60, keywords: ["RIPOSTE"] })]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "damage", side: 0, index: 0, amount: 25, crit: false, hp: state.fighters[0][0].maxHp - 25 });
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    ({ events } = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 }));
    expect(events.some((e) => e.t === "riposte")).toBe(false);
  });

  it("遺言 : à sa mort, soigne les alliés de 20 % de leurs PV max", () => {
    const setup = setupOf(
      [fighter({ power: 999 })],
      [fighter({ ki: 0, keywords: ["LAST_WILL"] }), fighter({ ki: 50 })],
    );
    const { state } = createState(setup);
    // Blesse d'abord l'allié pour voir le soin
    state.fighters[1][1].hp = 10;
    const { events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "heal", side: 1, index: 1, amount: 32, hp: 42 });
  });

  it("復活 : revient une fois avec 25 % de ses PV", () => {
    const setup = setupOf([fighter({ power: 999, keywords: ["FLURRY"] })], [fighter({ ki: 50, keywords: ["REVIVE"] }), fighter()]);
    let { state, events } = play(setup, createState(setup).state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "revive", side: 1, index: 0, hp: 40 });
    ({ state, events } = play(setup, state, { type: "ATTACK", side: 0, actor: 0, target: 0 }));
    expect(events).toContainEqual({ t: "ko", side: 1, index: 0 });
    expect(state.fighters[1][0].hp).toBe(0);
  });
});

describe("techniques 技", () => {
  /** Avance jusqu'au tour où le camp 0 a au moins `orbs` orbes. */
  function withOrbs(setup: BattleSetup, orbs: number) {
    let { state } = createState(setup);
    while (state.orbs < orbs || state.active !== 0) state = play(setup, state, { type: "END_TURN", side: state.active }).state;
    return state;
  }

  it("一閃 : coup à ×1,6 et coûte 2 orbes", () => {
    const setup = setupOf([fighter({ power: 80, technique: "ISSEN" })], [fighter({ ki: 60 })]);
    const start = withOrbs(setup, 2);
    const { state, events } = play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 80 })); // 50 × 1,6
    expect(state.orbs).toBe(start.orbs - 2);
  });

  it("貫通 : ignore la DEF", () => {
    const setup = setupOf([fighter({ power: 80, technique: "KANTSU" })], [fighter({ ki: 60 })]);
    const { events } = play(setup, withOrbs(setup, 2), { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual(expect.objectContaining({ t: "damage", amount: 80 }));
  });

  it("乱舞 : frappe tous les ennemis, sans cible", () => {
    const setup = setupOf([fighter({ technique: "RANBU" })], team3());
    const start = withOrbs(setup, 3);
    expect(() => play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 })).toThrow("BAD_TARGET");
    const { events } = play(setup, start, { type: "TECHNIQUE", side: 0, actor: 0 });
    expect(events.filter((e) => e.t === "damage")).toHaveLength(3);
  });

  it("癒し, 守護 : visent un allié, jamais un ennemi", () => {
    const heal = setupOf([fighter({ technique: "IYASHI", ki: 50 })], [fighter()]);
    const start = withOrbs(heal, 2);
    start.fighters[0][0].hp = 100;
    const { events } = play(heal, start, { type: "TECHNIQUE", side: 0, actor: 0, target: 0 });
    expect(events).toContainEqual({ t: "heal", side: 0, index: 0, amount: 48, hp: 148 });

    const guard = setupOf([fighter({ technique: "SHUGO" }), fighter()], [fighter()]);
    const s2 = withOrbs(guard, 2);
    expect(() => play(guard, s2, { type: "TECHNIQUE", side: 0, actor: 0, target: 2 })).toThrow("BAD_TARGET");
    expect(play(guard, s2, { type: "TECHNIQUE", side: 0, actor: 0, target: 1 }).state.fighters[0][1].barrier).toBe(true);
  });

  it("鼓舞 : +20 % d'ATK aux alliés pendant ce tour et le suivant", () => {
    const setup = setupOf([fighter({ technique: "KOBU" }), fighter({ power: 80 })], [fighter({ ki: 60, power: 1 })]);
    let state = withOrbs(setup, 2);
    state = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0 }).state;
    const boosted = play(setup, state, { type: "ATTACK", side: 0, actor: 1, target: 0 });
    state = boosted.state;
    expect(boosted.events).toContainEqual(expect.objectContaining({ t: "damage", amount: 60 })); // 50 × 1,2
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    expect(state.fighters[0][1].buffTurns).toBe(1);
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[0][1]).toMatchObject({ buffTurns: 0, buffPct: 0 });
  });

  it("封印 : la cible ne peut pas agir à son prochain tour", () => {
    const setup = setupOf([fighter({ technique: "FUIN" })], [fighter(), fighter()]);
    let state = withOrbs(setup, 3);
    state = play(setup, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1].map((f) => f.actionsLeft)).toEqual([1, 0]);
    state = play(setup, state, { type: "END_TURN", side: 1 }).state;
    state = play(setup, state, { type: "END_TURN", side: 0 }).state;
    expect(state.fighters[1].map((f) => f.actionsLeft)).toEqual([1, 1]);
  });
});

describe("déterminisme et robustesse", () => {
  it("même graine + mêmes actions = mêmes événements ; replay identique à la partie jouée", () => {
    const rng = seededRng(42);
    const setup = setupOf(randomTeam(rng), randomTeam(rng), RULES);
    const { state, actions } = botGame(7, setup);
    const a = replay(setup, 7, actions);
    const b = replay(setup, 7, actions);
    expect(a).toEqual(b);
    expect(a.state).toEqual(state);
  });

  it("une autre graine donne d'autres chiffres", () => {
    const setup = setupOf(team3(), team3(), RULES);
    const s = createState(setup).state;
    const amounts = new Set(
      Array.from({ length: 20 }, (_, seed) => {
        const d = play(setup, s, { type: "ATTACK", side: 0, actor: 0, target: 0 }, seed).events.find((e) => e.t === "damage");
        return d?.t === "damage" ? d.amount : -1;
      }),
    );
    expect(amounts.size).toBeGreaterThan(1);
  });
});
