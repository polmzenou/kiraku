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
});
