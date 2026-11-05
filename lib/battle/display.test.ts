import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { botAction } from "./bot";
import { applyEvent } from "./display";
import { applyAction, createState } from "./engine";
import { RULES, fighter, setupOf } from "./fixtures";

describe("état affiché pendant l'animation", () => {
  it("rejouer les événements d'une action redonne les PV, barrières et fin du serveur", () => {
    const rng = seededRng(3);
    const team = () => [fighter({ keywords: ["BARRIER"] }), fighter({ keywords: ["REVIVE"], technique: "RANBU" }), fighter({ technique: "IYASHI" })];
    const setup = setupOf(team(), team(), RULES);
    let { state } = createState(setup);
    for (let i = 0; i < 300 && !state.finished; i++) {
      const res = applyAction(setup, 11, state, botAction(setup, state, state.active, rng, 20));
      const shown = res.events.reduce(applyEvent, state);
      expect(shown.fighters.map((t) => t.map((f) => f.hp))).toEqual(res.state.fighters.map((t) => t.map((f) => f.hp)));
      expect(shown.fighters.map((t) => t.map((f) => f.barrier))).toEqual(res.state.fighters.map((t) => t.map((f) => f.barrier)));
      expect([shown.active, shown.finished, shown.winner]).toEqual([res.state.active, res.state.finished, res.state.winner]);
      state = res.state;
    }
    expect(state.finished).toBe(true);
  });

  it("un gain d'orbes suit le serveur, une parade et un soin de vampirisme aussi", () => {
    const setup = setupOf(
      [fighter({ technique: "MEISO", keywords: ["CHANNEL"] }), fighter({ technique: "DOKUGIRI", keywords: ["LIFESTEAL"] }), fighter({ technique: "KONSHIN" })],
      [fighter({ keywords: ["BARRIER"], technique: "RENGEKI" }), fighter({ keywords: ["CHANNEL"], technique: "JIU" }), fighter()],
      RULES,
    );
    const rng = seededRng(5);
    let { state } = createState(setup);
    for (let i = 0; i < 300 && !state.finished; i++) {
      const res = applyAction(setup, 3, state, botAction(setup, state, state.active, rng, 30));
      const shown = res.events.reduce(applyEvent, state);
      expect(shown.fighters.map((t) => t.map((f) => f.hp))).toEqual(res.state.fighters.map((t) => t.map((f) => f.hp)));
      const gained = res.events.filter((e) => e.t === "orbs").at(-1);
      if (gained?.t === "orbs") expect(shown.orbs).toBe(gained.orbs);
      state = res.state;
    }
    expect(state.finished).toBe(true);
  });

  it("la rupture de la synergie éteint le camp concerné, sans toucher à l'autre", () => {
    const setup = setupOf([fighter(), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const state = { ...createState(setup).state, synergy: [true, true] as [boolean, boolean] };
    const next = applyEvent(state, { t: "synergy_break", side: 1 });
    expect(next.synergy).toEqual([true, false]);
    expect(state.synergy).toEqual([true, true]);
  });

  it("un événement de rupture ne crée rien sur une partie sans synergie", () => {
    const setup = setupOf([fighter()], [fighter()]);
    expect("synergy" in applyEvent(createState(setup).state, { t: "synergy_break", side: 0 })).toBe(false);
  });
});
