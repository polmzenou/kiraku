import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { randomTeam } from "./bot-games";
import { botAction } from "./bot";
import { choreograph, EMPTY_MEMORY, TIMING, totalDuration, type Beat, type ChoreoContext, type Cue, type FxLevel, type StageMemory } from "./choreography";
import { applyEvent } from "./display";
import { applyAction, createState } from "./engine";
import { FLAT_RULES, RULES, fighter, setupOf } from "./fixtures";
import { NEW_TECHNIQUES, TECHNIQUE_TARGET, type Action, type BattleEvent, type BattleSetup, type BattleState, type Side, type Technique } from "./types";

/** Une partie bot contre bot, lot par lot (une action = un lot, comme en direct). */
function batches(setup: BattleSetup, seed: number) {
  const rng = seededRng(seed ^ 0x51a6e);
  let { state } = createState(setup);
  const out: { before: BattleState; events: BattleEvent[]; after: BattleState }[] = [];
  for (let guard = 0; !state.finished && guard < 600; guard++) {
    const res = applyAction(setup, seed, state, botAction(setup, state, state.active, rng, 25));
    out.push({ before: state, events: res.events, after: res.state });
    state = res.state;
  }
  return out;
}

function play(setup: BattleSetup, seed: number, level: FxLevel, style: ChoreoContext["style"] = "sumi") {
  let memory: StageMemory = EMPTY_MEMORY;
  return batches(setup, seed).map((b) => {
    const res = choreograph(b.events, { setup, state: b.before, mySide: 0, level, style, memory });
    memory = res.memory;
    return { ...b, ...res };
  });
}

const games = Array.from({ length: 40 }, (_, i) => {
  const rng = seededRng(4_000 + i);
  return { setup: setupOf(randomTeam(rng), randomTeam(rng), RULES, (i % 2) as Side), seed: 900 + i };
});

const cues = (beats: readonly Beat[]) => beats.flatMap((b) => b.steps.flatMap((s) => (s.cue ? [s.cue] : [])));
// Comme display.test : PV et barrières (le serveur lève aussi le sceau en début de tour, l'affichage le suit en fin de lot)
const hp = (s: BattleState) => s.fighters.map((t) => t.map((f) => [f.hp, f.barrier]));

// Parties bot contre bot rejouées à chaque test : quelques secondes quand toute la suite tourne en parallèle
describe("mise en scène des combats", { timeout: 30_000 }, () => {
  it("rend chaque événement une fois, dans l'ordre, et aboutit à l'état d'applyEvent", () => {
    for (const { setup, seed } of games) {
      for (const level of ["full", "lite", "reduced"] as const) {
        for (const batch of play(setup, seed, level)) {
          const out = batch.beats.flatMap((b) => b.steps.flatMap((s) => (s.event ? [s.event] : [])));
          expect(out).toEqual(batch.events);
          expect(hp(batch.state)).toEqual(hp(batch.events.reduce(applyEvent, batch.before)));
          expect(hp(batch.state)).toEqual(hp(batch.after));
          expect([batch.state.active, batch.state.finished, batch.state.winner]).toEqual([batch.after.active, batch.after.finished, batch.after.winner]);
        }
      }
    }
  });

  it("garde des heures croissantes dans chaque temps fort, et une durée qui couvre le dernier repère", () => {
    for (const batch of play(games[0].setup, games[0].seed, "full")) {
      for (const beat of batch.beats) {
        beat.steps.forEach((s, i) => i > 0 && expect(s.at).toBeGreaterThanOrEqual(beat.steps[i - 1].at));
        expect(beat.duration).toBeGreaterThanOrEqual(beat.steps.at(-1)?.at ?? 0);
      }
    }
  });

  it("en mouvement réduit : tout tombe à 0 ms, sans mouvement, flash ni cut-in", () => {
    const moving = new Set<Cue["k"]>(["approach", "return", "hitstop", "impact", "frame", "shake", "camera", "cutin", "technique", "passive", "arena"]);
    for (const { setup, seed } of games.slice(0, 15)) {
      for (const batch of play(setup, seed, "reduced")) {
        expect(totalDuration(batch.beats)).toBe(0);
        for (const beat of batch.beats) {
          for (const s of beat.steps) {
            expect(s.at).toBe(0);
            if (s.cue) expect(moving.has(s.cue.k)).toBe(false);
            if (s.cue?.k === "sound") expect(beat.kind).toBe("end");
            // Les orbes payées ne volent pas jusqu'à la carte
            if (s.cue?.k === "orbs") expect(s.cue.spentBy).toBeUndefined();
          }
        }
      }
    }
  });

  describe("nouvelles capacités", () => {
    const scene = (setup: BattleSetup, before: BattleState, events: BattleEvent[], level: FxLevel = "full") => choreograph(events, { setup, state: before, mySide: 0, level, style: "sumi", memory: EMPTY_MEMORY });
    const cast = (technique: Technique, foes: Parameters<typeof fighter>[0][] = [{ hp: 900 }, { hp: 900 }, { hp: 900 }]) => {
      const setup = setupOf([fighter({ technique }), fighter(), fighter()], foes.map((o) => fighter(o)), FLAT_RULES);
      const before = { ...createState(setup).state, orbs: 5 };
      const target = TECHNIQUE_TARGET[technique] === "NONE" ? {} : { target: 0 };
      const { events } = applyAction(setup, 1, before, { type: "TECHNIQUE", side: 0, actor: 0, ...target });
      return { setup, before, events };
    };

    it.each(NEW_TECHNIQUES)("%s pose son effet et son cut-in", (technique) => {
      const { setup, before, events } = cast(technique);
      const all = cues(scene(setup, before, events).beats);
      expect(all).toContainEqual(expect.objectContaining({ k: "technique", technique }));
      expect(all).toContainEqual(expect.objectContaining({ k: "cutin", technique }));
      // La carte finit toujours par regagner sa place
      expect(all.some((c) => c.k === "return")).toBe(true);
    });

    it.each(NEW_TECHNIQUES)("%s, en mouvement réduit : l'état bascule sans mouvement", (technique) => {
      const { setup, before, events } = cast(technique);
      const { beats, state } = scene(setup, before, events, "reduced");
      expect(totalDuration(beats)).toBe(0);
      expect(cues(beats).some((c) => c.k === "technique" || c.k === "cutin" || c.k === "passive")).toBe(false);
      expect(hp(state)).toEqual(hp(events.reduce(applyEvent, before)));
    });

    it("Double frappe : la carte reste au contact, puis revient après le second coup", () => {
      const { setup, before, events } = cast("RENGEKI");
      const steps = scene(setup, before, events).beats.flatMap((b) => b.steps);
      const hits = steps.filter((s) => s.event?.t === "damage");
      const back = steps.findIndex((s) => s.cue?.k === "return");
      expect(hits).toHaveLength(2);
      expect(hits[1].at).toBeGreaterThan(hits[0].at);
      expect(back).toBeGreaterThan(steps.indexOf(hits[1]));
    });

    it("Vampirisme sur un coup fatal : le coup de grâce garde son effet, le feu follet part de la cible", () => {
      const setup = setupOf([fighter({ power: 300, keywords: ["LIFESTEAL"] })], [fighter({ ki: 1, hp: 5 })], FLAT_RULES);
      const before = createState(setup).state;
      before.fighters[0][0].hp = 10;
      const { events } = applyAction(setup, 1, before, { type: "ATTACK", side: 0, actor: 0, target: 0 });
      expect(events.map((e) => e.t).slice(0, 4)).toEqual(["attack", "damage", "ko", "lifesteal"]);
      const all = cues(scene(setup, before, events).beats);
      expect(all).toContainEqual(expect.objectContaining({ k: "frame", finisher: true }));
      expect(all).toContainEqual({ k: "passive", fx: "lifesteal", slot: { side: 0, index: 0 }, from: { side: 1, index: 0 } });
    });

    it("Concentration : les orbes et les cartes qui les rapportent, après le tour annoncé", () => {
      const setup = setupOf([fighter()], [fighter({ keywords: ["CHANNEL"] }), fighter({ keywords: ["CHANNEL"] }), fighter()], RULES, 0);
      const before = createState(setup).state;
      const { events } = applyAction(setup, 1, before, { type: "END_TURN", side: 0 });
      const { beats, state } = scene(setup, before, events);
      const gained = events.find((e) => e.t === "orbs");
      const all = cues(beats);
      expect(gained).toBeDefined();
      expect(all.filter((c) => c.k === "passive" && c.fx === "channel")).toHaveLength(2);
      expect(all.filter((c) => c.k === "orbs").at(-1)).toMatchObject({ count: (gained as { orbs: number }).orbs });
      expect(state.orbs).toBe((gained as { orbs: number }).orbs);
    });

    it("Méditation : les orbes montent, sans le signal de Concentration", () => {
      const setup = setupOf([fighter({ technique: "MEISO", keywords: ["CHANNEL"] })], [fighter({ hp: 900 })], FLAT_RULES);
      const before = createState(setup).state;
      const { events } = applyAction(setup, 1, before, { type: "TECHNIQUE", side: 0, actor: 0 });
      const all = cues(scene(setup, before, events).beats);
      expect(all.some((c) => c.k === "passive" && c.fx === "channel")).toBe(false);
      expect(all.some((c) => c.k === "sound" && c.name === "orb")).toBe(true);
    });
  });

  describe("rupture de la synergie", () => {
    const universe = { key: "u1", name: "JJK" };
    const setup: BattleSetup = {
      ...setupOf([fighter({ universe, hp: 1, ki: 1 }), fighter({ universe }), fighter({ universe })], [fighter({ power: 200 }), fighter(), fighter()], FLAT_RULES),
      synergy: [{ ...universe, atkPct: 10 }, null],
    };
    const before = applyAction(setup, 1, createState(setup).state, { type: "END_TURN", side: 0 }).state;
    const { events } = applyAction(setup, 1, before, { type: "ATTACK", side: 1, actor: 0, target: 0 });
    const scene = (level: FxLevel) => choreograph(events, { setup, state: before, mySide: 0, level, style: "sumi", memory: EMPTY_MEMORY });

    it("le repère suit le K.-O. dans le même temps fort, avec le tonnerre", () => {
      const { beats, state } = scene("full");
      expect(beats).toHaveLength(1);
      const steps = beats[0].steps;
      const ko = steps.findIndex((s) => s.event?.t === "ko");
      const broke = steps.findIndex((s) => s.event?.t === "synergy_break");
      expect(ko).toBeGreaterThanOrEqual(0);
      expect(broke).toBeGreaterThan(ko);
      expect(cues(beats)).toContainEqual({ k: "synergyBreak", side: 0 });
      expect(cues(beats)).toContainEqual({ k: "sound", name: "thunder" });
      expect(state.synergy).toEqual([false, false]);
    });

    it("en mouvement réduit : l'état bascule, sans effet ni son", () => {
      const { beats, state } = scene("reduced");
      expect(cues(beats).some((c) => c.k === "synergyBreak" || (c.k === "sound" && c.name === "thunder"))).toBe(false);
      expect(beats.flatMap((b) => b.steps).some((s) => s.event?.t === "synergy_break")).toBe(true);
      expect(state.synergy).toEqual([false, false]);
    });
  });

  it("en effets allégés : aucune impact frame plein écran, des cut-in brefs", () => {
    for (const { setup, seed } of games.slice(0, 15)) {
      const all = play(setup, seed, "lite").flatMap((b) => cues(b.beats));
      expect(all.some((c) => c.k === "frame")).toBe(false);
      expect(all.filter((c) => c.k === "cutin").every((c) => c.k === "cutin" && !c.full)).toBe(true);
    }
  });

  it("tient le budget de flashs : au plus un par temps fort, jamais plus de 3 par seconde", () => {
    let frames = 0;
    for (const { setup, seed } of games) {
      for (const style of ["sumi", "koma", "mie"] as const) {
        let clock = 0;
        let last = -Infinity;
        for (const batch of play(setup, seed, "full", style)) {
          for (const beat of batch.beats) {
            const here = beat.steps.filter((s) => s.cue?.k === "frame");
            expect(here.length).toBeLessThanOrEqual(1);
            for (const s of here) {
              expect(clock + s.at - last).toBeGreaterThanOrEqual(334);
              last = clock + s.at;
              frames++;
            }
            clock += beat.duration;
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(0);
  });

  it("donne à chaque événement du moteur son effet", () => {
    const seen = new Map<BattleEvent["t"], Cue["k"][]>();
    for (const { setup, seed } of games) {
      for (const batch of play(setup, seed, "full")) {
        for (const beat of batch.beats) {
          beat.steps.forEach((s) => {
            if (!s.event) return;
            const near = beat.steps.filter((o) => o.cue && Math.abs(o.at - s.at) <= 1).map((o) => o.cue!.k);
            seen.set(s.event.t, [...(seen.get(s.event.t) ?? []), ...near]);
          });
        }
      }
    }
    expect(seen.get("turn")).toContain("banner");
    expect(seen.get("damage")).toEqual(expect.arrayContaining(["impact", "number", "hitstop"]));
    expect(seen.get("block")).toContain("passive");
    expect(seen.get("poisoned")).toContain("passive");
    expect(seen.get("poison")).toEqual(expect.arrayContaining(["passive", "number"]));
    expect(seen.get("riposte")).toEqual(expect.arrayContaining(["passive", "approach"]));
    expect(seen.get("ko")).toContain("ko");
    expect(seen.get("end")).toContain("arena");
    for (const t of ["heal", "revive", "barrier", "buff", "seal"] as const) expect(seen.has(t)).toBe(true);
  });

  it("met en scène l'abandon et le temps écoulé, puis la fin de partie", () => {
    const setup = setupOf([fighter(), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const { state } = createState(setup);
    for (const action of [{ type: "TIMEOUT", side: 0 }, { type: "FORFEIT", side: 0 }] as Action[]) {
      const res = applyAction(setup, 1, state, action);
      const { beats } = choreograph(res.events, { setup, state, mySide: 0, level: "full", style: "sumi", memory: EMPTY_MEMORY });
      expect(beats[0].kind).toBe("status");
      if (action.type === "FORFEIT") expect(cues(beats)).toContainEqual({ k: "arena", reaction: "defeat" });
    }
  });

  it("joue le cut-in complet au premier lancer d'une carte, puis bref", () => {
    const caster = fighter({ technique: "IYASHI", keywords: ["FLURRY"] });
    const setup = setupOf([caster, fighter(), fighter()], [fighter(), fighter(), fighter()], { ...FLAT_RULES, orbs: { start: 5, perTurn: 0, max: 5, secondBonus: 0 } });
    let { state } = createState(setup);
    let memory = EMPTY_MEMORY;
    const full: boolean[] = [];
    for (let n = 0; n < 2; n++) {
      const res = applyAction(setup, 1, state, { type: "TECHNIQUE", side: 0, actor: 0, target: 1 });
      const out = choreograph(res.events, { setup, state, mySide: 0, level: "full", style: "sumi", memory });
      full.push(...cues(out.beats).flatMap((c) => (c.k === "cutin" ? [c.full] : [])));
      expect(cues(out.beats)).toContainEqual(expect.objectContaining({ k: "orbs", side: 0, count: 5 - 2 * (n + 1) }));
      memory = out.memory;
      state = res.state;
    }
    expect(full).toEqual([true, false]);
  });

  it("signale 疾風 à la deuxième action d'une carte dans le tour", () => {
    const setup = setupOf([fighter({ keywords: ["FLURRY"], power: 40 }), fighter(), fighter()], [fighter({ ki: 86 }), fighter({ ki: 86 }), fighter({ ki: 86 })]);
    let { state } = createState(setup);
    let memory = EMPTY_MEMORY;
    const fx: string[] = [];
    for (let n = 0; n < 2; n++) {
      const res = applyAction(setup, 1, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
      const out = choreograph(res.events, { setup, state, mySide: 0, level: "full", style: "sumi", memory });
      fx.push(...cues(out.beats).flatMap((c) => (c.k === "passive" ? [c.fx] : [])));
      memory = out.memory;
      state = res.state;
    }
    expect(fx).toEqual(["flurry"]);
  });

  it("annonce le coup de grâce : ralenti et impact frame sur le dernier K.-O.", () => {
    const setup = setupOf([fighter({ power: 100 })], [fighter({ ki: 30, hp: 1 })]);
    const { state } = createState(setup);
    const res = applyAction(setup, 1, state, { type: "ATTACK", side: 0, actor: 0, target: 0 });
    const { beats } = choreograph(res.events, { setup, state, mySide: 0, level: "full", style: "koma", memory: EMPTY_MEMORY });
    const all = cues(beats);
    expect(all).toContainEqual(expect.objectContaining({ k: "frame", style: "koma", finisher: true, ms: TIMING.frame.koma }));
    expect(all).toContainEqual(expect.objectContaining({ k: "camera", mode: "slowmo" }));
    expect(all).toContainEqual({ k: "ko", slot: { side: 1, index: 0 }, finisher: true });
    expect(all).toContainEqual({ k: "arena", reaction: "victory" });
  });
});
