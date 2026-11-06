import { applyEvent } from "./display";
import { other } from "./engine";
import type { BattleEvent, BattleSetup, BattleState, Side, Technique, Ultimate } from "./types";

// Mise en scène d'un lot d'événements du moteur. Chaque action devient un temps fort minuté (tour,
// échange de coups, technique, ulti, tic de poison, fin de partie) qui porte ses repères : effets visuels,
// sons, caméra et réactions de l'arène. Pur et déterministe : le metteur en scène
// (components/battle/stage/useDirector) joue chaque repère à son heure ; l'état affiché suit
// applyEvent, et l'état du serveur fait foi à la fin du lot. Aucun réglage de jeu ici : seulement le
// rythme de l'animation.

export type FxLevel = "full" | "lite" | "reduced";

/** Style des impact frames (critiques et coups de grâce) : négatif à l'encre, cases de manga, pose de kabuki. */
export const IMPACT_STYLES = ["sumi", "koma", "mie"] as const;
export type ImpactStyle = (typeof IMPACT_STYLES)[number];

export type Slot = { side: Side; index: number };

export type BattleSound =
  | "swing"
  | "hit"
  | "heavy"
  | "crit"
  | "slash"
  | "pierce"
  | "block"
  | "heal"
  | "poison"
  | "bubble"
  | "seal"
  | "drum"
  | "barrier"
  | "gong"
  | "revive"
  | "clack"
  | "cutin"
  | "ultimate"
  | "wisp"
  | "flurry"
  | "taunt"
  | "orb"
  | "timeout"
  | "victory"
  | "defeat"
  | "draw"
  // Sons du décor, joués par les arènes
  | "knock"
  | "thunder"
  | "cheer"
  | "firework"
  | "splash"
  | "chime";

export type ArenaReaction = "turn" | "hit" | "crit" | "ko" | "technique" | "victory" | "defeat" | "draw";

export type PassiveFx = "block" | "poisoned" | "poison" | "riposte" | "lastWill" | "revive" | "flurry" | "taunt" | "lifesteal" | "channel";

export type Cue =
  /** Bannière du tour, lumière de l'arène et orbes de ce tour. */
  | { k: "banner"; side: Side; turn: number }
  | { k: "light"; side: Side }
  | { k: "orbs"; side: Side; count: number; spentBy?: Slot }
  /** Élan puis ruée vers la cible (`dash`), ou carte qui se dresse sur place (`cast`). */
  | { k: "approach"; actor: Slot; target: Slot | null; mode: "dash" | "cast"; ms: number }
  | { k: "return"; actor: Slot; ms: number }
  /** Les cartes figées au contact (hit-stop). */
  | { k: "hitstop"; ms: number; slots: Slot[] }
  /** Impact local : éclair, éclats d'encre, recul de la cible après le hit-stop. */
  | { k: "impact"; slot: Slot; from: Slot | null; power: 1 | 2 | 3; crit: boolean; stop: number }
  /** Impact frame plein écran, au plus une par temps fort, jamais en effets allégés ni réduits. `ultimate` : son nom en légende. */
  | { k: "frame"; style: ImpactStyle; from: Slot; to: Slot; finisher: boolean; ms: number; ultimate?: Ultimate }
  | { k: "number"; slot: Slot; kind: "damage" | "crit" | "heal" | "poison" | "block"; amount: number }
  /** Secousse d'une carte, ou de la caméra quand `slot` est nul. */
  | { k: "shake"; slot: Slot | null; power: number }
  | { k: "camera"; mode: "punch" | "slowmo"; slot: Slot | null; ms: number }
  | { k: "cutin"; actor: Slot; technique: Technique; full: boolean; ms: number }
  | { k: "technique"; technique: Technique; actor: Slot; targets: Slot[] }
  /** Cut-in d'ulti : toujours complet, bandeau doré. */
  | { k: "ultimateCutin"; actor: Slot; ultimate: Ultimate; ms: number }
  /** Effet propre à chaque ulti, sur ses cibles. */
  | { k: "ultimate"; ultimate: Ultimate; actor: Slot; targets: Slot[] }
  | { k: "passive"; fx: PassiveFx; slot: Slot; from?: Slot }
  | { k: "ko"; slot: Slot; finisher: boolean }
  /** Le filament de synergie d'un camp se rompt. */
  | { k: "synergyBreak"; side: Side }
  | { k: "arena"; reaction: ArenaReaction; side?: Side }
  | { k: "sound"; name: BattleSound };

export type Step = { at: number; event?: BattleEvent; cue?: Cue };
export type BeatKind = "turn" | "strike" | "technique" | "ultimate" | "poison" | "status" | "end" | "loose";
export type Beat = { kind: BeatKind; steps: Step[]; duration: number };

/** Ce que la mise en scène retient d'un lot à l'autre : actions du tour (疾風) et premières techniques (cut-in complet). */
export type StageMemory = { turnActions: Record<string, number>; cast: string[] };
export const EMPTY_MEMORY: StageMemory = { turnActions: {}, cast: [] };

export type ChoreoContext = {
  setup: BattleSetup;
  /** État affiché avant le lot. */
  state: BattleState;
  mySide: Side;
  level: FxLevel;
  style: ImpactStyle;
  memory: StageMemory;
};

/** Rythme de base, en millisecondes à vitesse ×1. */
export const TIMING = {
  turn: 760,
  approach: 300,
  dash: 220,
  cast: 260,
  hitstop: 80,
  hitstopCrit: 140,
  ret: 340,
  settle: 300,
  block: 360,
  poisoned: 300,
  tick: 520,
  ko: 680,
  finisher: 1_150,
  slowmo: 300,
  revive: 1_000,
  synergyBreak: 420,
  orbGain: 320,
  wisp: 460,
  riposte: 200,
  cutinFull: 1_050,
  cutinBrief: 440,
  ultimateCutin: 1_400,
  ultimateSlowmo: 520,
  ranbuGap: 170,
  heal: 380,
  barrier: 560,
  buff: 320,
  seal: 420,
  status: 420,
  end: 320,
  tail: 160,
  frame: { sumi: 220, koma: 820, mie: 940 } satisfies Record<ImpactStyle, number>,
} as const;

/** Part des PV max au-delà de laquelle un coup est lourd (fissures, caméra). */
const HEAVY_SHARE = 0.3;

const slotKey = (s: Slot) => `${s.side}-${s.index}`;
const slot = (side: Side, index: number): Slot => ({ side, index });
const alive = (state: BattleState, side: Side) => state.fighters[side].filter((f) => f.hp > 0).length;

/** Fin d'un temps fort d'action : le prochain événement ouvre un nouveau temps fort. */
const OPENS_BEAT = new Set<BattleEvent["t"]>(["turn", "attack", "ultimate", "poison", "timeout", "forfeit", "end"]);

class Scene {
  readonly beats: Beat[] = [];
  state: BattleState;
  memory: StageMemory;
  constructor(readonly ctx: ChoreoContext) {
    this.state = ctx.state;
    this.memory = { turnActions: { ...ctx.memory.turnActions }, cast: [...ctx.memory.cast] };
  }
  get full() {
    return this.ctx.level === "full";
  }
}

/** Un temps fort en construction : curseur `t`, repères posés à des heures relatives à son début. */
class Draft {
  readonly steps: Step[] = [];
  t = 0;
  frameUsed = false;
  constructor(
    readonly kind: BeatKind,
    private readonly b: Scene,
  ) {}
  cue(at: number, cue: Cue) {
    this.steps.push({ at, cue });
  }
  event(at: number, event: BattleEvent) {
    this.steps.push({ at, event });
    this.b.state = applyEvent(this.b.state, event);
  }
  sound(at: number, name: BattleSound) {
    this.cue(at, { k: "sound", name });
  }
  done(extra: number = TIMING.tail): Beat {
    const last = this.steps.reduce((m, s) => Math.max(m, s.at), 0);
    // Tri stable : les repères d'une même heure gardent leur ordre d'écriture
    const steps = this.steps.map((s, i) => ({ s, i })).sort((a, z) => a.s.at - z.s.at || a.i - z.i).map(({ s }) => s);
    return { kind: this.kind, steps, duration: Math.max(this.t, last) + extra };
  }
}

/**
 * Transforme un lot d'événements en temps forts. Les événements ressortent tous, dans leur ordre
 * d'origine (l'état affiché à la fin du lot est celui d'applyEvent).
 */
export function choreograph(events: readonly BattleEvent[], ctx: ChoreoContext): { beats: Beat[]; state: BattleState; memory: StageMemory } {
  const b = new Scene(ctx);
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.t === "turn") i = turnBeat(b, events, i);
    else if (e.t === "attack") i = actionBeat(b, events, i);
    else if (e.t === "ultimate") i = ultimateBeat(b, events, i);
    else if (e.t === "poison") i = tickBeat(b, events, i);
    else if (e.t === "timeout" || e.t === "forfeit") i = statusBeat(b, events, i);
    else if (e.t === "end") i = endBeat(b, events, i);
    else i = looseBeat(b, events, i);
  }
  const beats = ctx.level === "reduced" ? b.beats.map(still) : b.beats;
  return { beats, state: b.state, memory: b.memory };
}

/** Mouvement réduit : tout s'applique d'un coup, sans mouvement ni flash ; restent les chiffres, l'état et le son de fin. */
function still(beat: Beat): Beat {
  const keep = (c: Cue) =>
    c.k === "number" || c.k === "orbs" || c.k === "banner" || c.k === "light" || c.k === "ko" || (c.k === "sound" && beat.kind === "end");
  // Les orbes changent de nombre, mais aucune ne vole jusqu'à la carte qui les dépense
  const settle = (s: Step): Step => (s.cue?.k === "orbs" && s.cue.spentBy ? { ...s, at: 0, cue: { k: "orbs", side: s.cue.side, count: s.cue.count } } : { ...s, at: 0 });
  return { kind: beat.kind, duration: 0, steps: beat.steps.filter((s) => s.event || (s.cue && keep(s.cue))).map(settle) };
}

function turnBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const e = events[i] as Extract<BattleEvent, { t: "turn" }>;
  const beat = new Draft("turn", b);
  b.memory.turnActions = {};
  beat.event(0, e);
  beat.cue(0, { k: "banner", side: e.side, turn: e.turn });
  beat.cue(0, { k: "light", side: e.side });
  beat.cue(0, { k: "orbs", side: e.side, count: e.orbs });
  beat.sound(0, "clack");
  beat.cue(0, { k: "arena", reaction: "turn", side: e.side });
  // 挑発 : les cartes qui attirent les coups se signalent au camp qui va frapper
  const defenders = other(e.side);
  const taunts = b.ctx.setup.teams[defenders].flatMap((f, index) => (f.keywords.includes("TAUNT") && b.state.fighters[defenders][index].hp > 0 ? [index] : []));
  taunts.forEach((index) => beat.cue(340, { k: "passive", fx: "taunt", slot: slot(defenders, index) }));
  if (taunts.length) beat.sound(340, "taunt");
  beat.t = TIMING.turn;
  b.beats.push(beat.done(0));
  return i + 1;
}

/** 疾風 : deuxième action de la même carte dans le tour. */
function countAction(b: Scene, beat: Draft, actor: Slot) {
  const k = slotKey(actor);
  const count = (b.memory.turnActions[k] ?? 0) + 1;
  b.memory.turnActions = { ...b.memory.turnActions, [k]: count };
  if (count === 2 && b.ctx.setup.teams[actor.side][actor.index].keywords.includes("FLURRY")) {
    beat.cue(0, { k: "passive", fx: "flurry", slot: actor });
    beat.sound(0, "flurry");
  }
}

/** Résultats d'une action : tout ce qui suit jusqu'au prochain temps fort. */
function resultsAfter(events: readonly BattleEvent[], i: number): { results: BattleEvent[]; next: number } {
  let j = i + 1;
  while (j < events.length && !OPENS_BEAT.has(events[j].t)) j++;
  return { results: events.slice(i + 1, j), next: j };
}

function actionBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const e = events[i] as Extract<BattleEvent, { t: "attack" }>;
  const actor = slot(e.side, e.actor);
  const tech = e.technique;
  const beat = new Draft(tech ? "technique" : "strike", b);
  beat.event(0, e);
  countAction(b, beat, actor);
  const { results, next: j } = resultsAfter(events, i);

  if (!tech) {
    const target = e.target === null ? null : slot(other(e.side), e.target);
    beat.cue(0, { k: "approach", actor, target, mode: "dash", ms: TIMING.approach });
    beat.sound(TIMING.approach - 90, "swing");
    beat.t = TIMING.approach;
    resolve(b, beat, actor, results, { base: 1, returns: [actor], gap: 0 });
  } else {
    technique(b, beat, e, actor, tech, results);
  }
  b.beats.push(beat.done());
  return j;
}

function technique(b: Scene, beat: Draft, e: Extract<BattleEvent, { t: "attack" }>, actor: Slot, tech: Technique, results: BattleEvent[]) {
  const { setup } = b.ctx;
  const cost = setup.rules.techniques[tech].cost;
  const orbs = Math.max(0, b.state.orbs - cost);
  b.state = { ...b.state, orbs };
  beat.cue(0, { k: "orbs", side: e.side, count: orbs, spentBy: actor });
  beat.sound(0, "orb");

  const key = slotKey(actor);
  const first = !b.memory.cast.includes(key);
  if (first) b.memory.cast = [...b.memory.cast, key];
  const full = first && b.full;
  const ms = full ? TIMING.cutinFull : TIMING.cutinBrief;
  beat.cue(0, { k: "cutin", actor, technique: tech, full, ms });
  beat.sound(0, "cutin");
  beat.cue(0, { k: "arena", reaction: "technique", side: e.side });
  beat.t = ms;

  const foe = other(e.side);
  const enemy = e.target === null ? null : slot(foe, e.target);
  const ally = e.target === null ? null : slot(e.side, e.target);
  const livingFoes = b.state.fighters[foe].flatMap((f, index) => (f.hp > 0 ? [slot(foe, index)] : []));
  const livingAllies = b.state.fighters[e.side].flatMap((f, index) => (f.hp > 0 ? [slot(e.side, index)] : []));

  switch (tech) {
    case "ISSEN":
    case "KANTSU":
    case "KONSHIN": {
      beat.cue(beat.t, { k: "approach", actor, target: enemy, mode: "dash", ms: TIMING.dash });
      beat.t += TIMING.dash;
      beat.cue(beat.t, { k: "technique", technique: tech, actor, targets: enemy ? [enemy] : [] });
      beat.sound(beat.t, tech === "KANTSU" ? "pierce" : "slash");
      resolve(b, beat, actor, results, { base: 2, returns: [actor], gap: 0 });
      return;
    }
    case "RENGEKI": {
      // La carte reste au contact pendant les deux coups, puis regagne sa place
      beat.cue(beat.t, { k: "approach", actor, target: enemy, mode: "dash", ms: TIMING.dash });
      beat.t += TIMING.dash;
      beat.cue(beat.t, { k: "technique", technique: tech, actor, targets: enemy ? [enemy] : [] });
      beat.sound(beat.t, "slash");
      resolve(b, beat, actor, results, { base: 1, returns: [], gap: TIMING.ranbuGap });
      beat.cue(beat.t, { k: "return", actor, ms: TIMING.ret });
      beat.t += TIMING.ret * 0.6;
      return;
    }
    case "RANBU": {
      beat.cue(beat.t, { k: "approach", actor, target: null, mode: "cast", ms: TIMING.cast });
      beat.t += TIMING.cast;
      beat.cue(beat.t, { k: "technique", technique: tech, actor, targets: livingFoes });
      beat.sound(beat.t, "slash");
      beat.t += 120;
      resolve(b, beat, actor, results, { base: 2, returns: [], gap: TIMING.ranbuGap });
      beat.cue(beat.t, { k: "return", actor, ms: TIMING.ret });
      beat.t += TIMING.ret * 0.6;
      return;
    }
    case "IYASHI":
    case "SHUGO":
    case "KOBU":
    case "FUIN":
    case "JIU":
    case "DOKUGIRI":
    case "MEISO": {
      beat.cue(beat.t, { k: "approach", actor, target: null, mode: "cast", ms: TIMING.cast });
      beat.t += TIMING.cast;
      const targets =
        tech === "KOBU" || tech === "JIU" ? livingAllies : tech === "DOKUGIRI" ? livingFoes : tech === "MEISO" ? [actor] : tech === "FUIN" ? (enemy ? [enemy] : []) : ally ? [ally] : [];
      beat.cue(beat.t, { k: "technique", technique: tech, actor, targets });
      if (tech === "IYASHI" || tech === "JIU") beat.sound(beat.t, "heal");
      if (tech === "DOKUGIRI") beat.sound(beat.t, "poison");
      if (tech === "MEISO") beat.sound(beat.t, "chime");
      if (tech === "SHUGO") beat.sound(beat.t, "barrier");
      if (tech === "KOBU") {
        beat.sound(beat.t, "drum");
        beat.sound(beat.t + 260, "drum");
      }
      if (tech === "FUIN") beat.sound(beat.t, "swing");
      const delay = tech === "IYASHI" || tech === "JIU" ? TIMING.heal : tech === "SHUGO" ? TIMING.barrier : tech === "KOBU" || tech === "MEISO" ? TIMING.buff : tech === "DOKUGIRI" ? TIMING.poisoned : TIMING.seal;
      beat.t += delay;
      if (tech === "FUIN") beat.sound(beat.t, "seal");
      resolve(b, beat, actor, results, { base: 1, returns: [], gap: 0 });
      beat.cue(beat.t, { k: "return", actor, ms: TIMING.ret });
      beat.t += TIMING.ret * 0.6;
      return;
    }
  }
}

/**
 * Un ulti : cut-in complet à chaque fois (bandeau doré), puis l'effet propre à l'ulti. Au moment fort, un
 * ralenti, la réaction de l'arène et, en effets complets, une impact frame qui porte son nom.
 */
function ultimateBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const e = events[i] as Extract<BattleEvent, { t: "ultimate" }>;
  const actor = slot(e.side, e.actor);
  const beat = new Draft("ultimate", b);
  beat.event(0, e);
  countAction(b, beat, actor);
  const { results, next } = resultsAfter(events, i);

  beat.cue(0, { k: "ultimateCutin", actor, ultimate: e.ultimate, ms: TIMING.ultimateCutin });
  beat.sound(0, "ultimate");
  beat.cue(0, { k: "arena", reaction: "technique", side: e.side });
  beat.t = TIMING.ultimateCutin;

  const foe = other(e.side);
  const enemy = e.target === null ? null : slot(foe, e.target);
  const ally = e.target === null ? null : slot(e.side, e.target);
  const livingFoes = b.state.fighters[foe].flatMap((f, index) => (f.hp > 0 ? [slot(foe, index)] : []));
  const livingAllies = b.state.fighters[e.side].flatMap((f, index) => (f.hp > 0 ? [slot(e.side, index)] : []));
  const climax = (to: Slot) => {
    beat.cue(beat.t, { k: "camera", mode: "slowmo", slot: to, ms: TIMING.ultimateSlowmo });
    beat.cue(beat.t, { k: "shake", slot: null, power: 6 });
    beat.cue(beat.t, { k: "arena", reaction: "crit", side: to.side });
  };
  // Ulti sans coup : l'impact frame se pose ici, les ultis qui frappent l'ont sur leur premier coup
  const frame = (to: Slot) => {
    if (!b.full || beat.frameUsed) return;
    beat.frameUsed = true;
    const ms = TIMING.frame[b.ctx.style];
    beat.cue(beat.t, { k: "frame", style: b.ctx.style, from: actor, to, finisher: false, ms, ultimate: e.ultimate });
    beat.t += ms;
  };
  const cast = () => {
    beat.cue(beat.t, { k: "approach", actor, target: null, mode: "cast", ms: TIMING.cast });
    beat.t += TIMING.cast;
  };
  const finish = () => {
    beat.cue(beat.t, { k: "return", actor, ms: TIMING.ret });
    beat.t += TIMING.ret * 0.6;
  };

  switch (e.ultimate) {
    case "TENCHU": {
      beat.cue(beat.t, { k: "approach", actor, target: enemy, mode: "dash", ms: TIMING.dash });
      beat.t += TIMING.dash;
      beat.cue(beat.t, { k: "ultimate", ultimate: e.ultimate, actor, targets: enemy ? [enemy] : [] });
      beat.sound(beat.t, "pierce");
      climax(enemy ?? actor);
      resolve(b, beat, actor, results, { base: 2, returns: [actor], gap: 0, frame: e.ultimate });
      break;
    }
    case "HYAKKA": {
      cast();
      beat.cue(beat.t, { k: "ultimate", ultimate: e.ultimate, actor, targets: livingFoes });
      beat.sound(beat.t, "slash");
      climax(livingFoes[0] ?? actor);
      beat.t += 120;
      resolve(b, beat, actor, results, { base: 2, returns: [], gap: TIMING.ranbuGap, frame: e.ultimate });
      finish();
      break;
    }
    case "KISHI": {
      cast();
      const to = ally ?? actor;
      beat.cue(beat.t, { k: "ultimate", ultimate: e.ultimate, actor, targets: ally ? [ally] : [] });
      beat.sound(beat.t, "revive");
      climax(to);
      frame(to);
      resolve(b, beat, actor, results, { base: 1, returns: [], gap: 0 });
      finish();
      break;
    }
    case "FUDO": {
      cast();
      beat.cue(beat.t, { k: "ultimate", ultimate: e.ultimate, actor, targets: livingAllies });
      beat.sound(beat.t, "barrier");
      climax(actor);
      frame(actor);
      beat.t += TIMING.barrier;
      resolve(b, beat, actor, results, { base: 1, returns: [], gap: 0 });
      finish();
      break;
    }
    case "TOKIDOME": {
      cast();
      const to = livingFoes[0] ?? actor;
      beat.cue(beat.t, { k: "ultimate", ultimate: e.ultimate, actor, targets: livingFoes });
      beat.sound(beat.t, "gong");
      climax(to);
      frame(to);
      beat.t += TIMING.seal;
      beat.sound(beat.t, "seal");
      resolve(b, beat, actor, results, { base: 1, returns: [], gap: 0 });
      finish();
      break;
    }
    default: {
      const unhandled: never = e.ultimate;
      throw new Error(`ulti inconnu : ${String(unhandled)}`);
    }
  }
  b.beats.push(beat.done());
  return next;
}

/**
 * Déroule les résultats d'une action au curseur du temps fort : coups (dégâts, parades), empoisonnement,
 * K.-O., rupture de la synergie, renaissance, soins de 遺言, riposte et contre-coup, barrière, encouragement, sceau.
 * `returns` : cartes qui regagnent leur place après le premier contact. `frame` : un ulti, dont le premier
 * coup porte l'impact frame même sans critique ni coup de grâce.
 */
function resolve(b: Scene, beat: Draft, from: Slot, results: readonly BattleEvent[], opts: { base: 1 | 2; returns: Slot[]; gap: number; frame?: Ultimate }) {
  let pendingReturns = [...opts.returns];
  let attacker = from;
  let lastKo: Slot | null = null;
  let lastHit: Slot | null = null;
  let hits = 0;
  const releaseReturns = () => {
    for (const r of pendingReturns) beat.cue(beat.t, { k: "return", actor: r, ms: TIMING.ret });
    pendingReturns = [];
  };

  for (let n = 0; n < results.length; n++) {
    const e = results[n];
    switch (e.t) {
      case "damage": {
        if (hits > 0 && opts.gap) beat.t += opts.gap;
        hits++;
        const target = slot(e.side, e.index);
        lastHit = target;
        const maxHp = b.state.fighters[e.side][e.index].maxHp;
        const heavy = e.amount >= maxHp * HEAVY_SHARE;
        const power = (e.crit ? 3 : heavy || opts.base === 2 ? 2 : 1) as 1 | 2 | 3;
        const stop = e.crit ? TIMING.hitstopCrit : TIMING.hitstop;
        const next = results[n + 1];
        const lethal = e.hp <= 0 && next?.t === "ko" && next.side === e.side && next.index === e.index;
        const finisher = lethal && alive(b.state, e.side) === 1;
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "hitstop", ms: stop, slots: [attacker, target] });
        beat.cue(beat.t, { k: "impact", slot: target, from: attacker, power, crit: e.crit, stop });
        beat.cue(beat.t, { k: "number", slot: target, kind: e.crit ? "crit" : "damage", amount: e.amount });
        beat.cue(beat.t, { k: "shake", slot: target, power: e.crit ? 9 : heavy ? 7 : 5 });
        if (power >= 2) beat.cue(beat.t, { k: "camera", mode: "punch", slot: target, ms: 300 });
        if (e.crit) beat.cue(beat.t, { k: "shake", slot: null, power: 5 });
        beat.sound(beat.t, e.crit ? "crit" : heavy ? "heavy" : "hit");
        let extra = 0;
        if (b.full && !beat.frameUsed && (e.crit || finisher || opts.frame)) {
          beat.frameUsed = true;
          extra = TIMING.frame[b.ctx.style];
          beat.cue(beat.t, { k: "frame", style: b.ctx.style, from: attacker, to: target, finisher, ms: extra, ...(opts.frame ? { ultimate: opts.frame } : {}) });
        }
        // L'arène réagit quand la scène revient : sous une impact frame, sa réaction serait masquée
        beat.cue(extra ? beat.t + stop + extra : beat.t, { k: "arena", reaction: e.crit ? "crit" : "hit", side: e.side });
        beat.t += stop + extra;
        releaseReturns();
        beat.t += TIMING.settle;
        break;
      }
      case "block": {
        const target = slot(e.side, e.index);
        if (e.pierced) {
          // La Barrière vole en éclats, le coup passe aussitôt : ni « Bloqué », ni temps d'arrêt
          beat.event(beat.t, e);
          beat.cue(beat.t, { k: "passive", fx: "block", slot: target, from: attacker });
          beat.sound(beat.t, "block");
          beat.t += 120;
          break;
        }
        if (hits > 0 && opts.gap) beat.t += opts.gap;
        hits++;
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "hitstop", ms: 60, slots: [attacker, target] });
        beat.cue(beat.t, { k: "passive", fx: "block", slot: target, from: attacker });
        beat.cue(beat.t, { k: "number", slot: target, kind: "block", amount: 0 });
        beat.sound(beat.t, "block");
        beat.t += 60;
        releaseReturns();
        beat.t += TIMING.block;
        break;
      }
      case "poisoned": {
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "passive", fx: "poisoned", slot: slot(e.side, e.index) });
        beat.sound(beat.t, "poison");
        beat.t += TIMING.poisoned;
        break;
      }
      case "ko": {
        const target = slot(e.side, e.index);
        // Les PV de la carte sont déjà à 0 : coup de grâce si plus personne ne tient debout dans ce camp
        const finisher = alive(b.state, e.side) === 0;
        if (finisher) {
          beat.cue(beat.t, { k: "camera", mode: "slowmo", slot: target, ms: TIMING.slowmo });
          beat.cue(beat.t, { k: "shake", slot: null, power: 7 });
        }
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "ko", slot: target, finisher });
        beat.sound(beat.t, "gong");
        beat.cue(beat.t, { k: "arena", reaction: "ko", side: e.side });
        lastKo = target;
        beat.t += finisher ? TIMING.finisher : TIMING.ko;
        break;
      }
      case "lifesteal": {
        // Un feu follet remonte de la carte touchée ; le chiffre du soin suit avec l'événement `heal`
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "passive", fx: "lifesteal", slot: slot(e.side, e.index), ...(lastHit ? { from: lastHit } : {}) });
        beat.sound(beat.t, "wisp");
        beat.t += TIMING.wisp;
        break;
      }
      case "orbs": {
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "orbs", side: e.side, count: e.orbs });
        beat.sound(beat.t, "orb");
        // Concentration : les cartes qui rapportent se signalent. Méditation a déjà son propre effet.
        if (beat.kind !== "technique") {
          b.ctx.setup.teams[e.side].forEach((f, index) => {
            if (f.keywords.includes("CHANNEL") && b.state.fighters[e.side][index].hp > 0) beat.cue(beat.t, { k: "passive", fx: "channel", slot: slot(e.side, index) });
          });
        }
        beat.t += TIMING.orbGain;
        break;
      }
      case "synergy_break": {
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "synergyBreak", side: e.side });
        beat.sound(beat.t, "thunder");
        beat.t += TIMING.synergyBreak;
        break;
      }
      case "revive": {
        const target = slot(e.side, e.index);
        beat.cue(beat.t, { k: "passive", fx: "revive", slot: target });
        beat.sound(beat.t, "revive");
        beat.event(beat.t + TIMING.revive * 0.55, e);
        beat.t += TIMING.revive;
        break;
      }
      case "raise": {
        // Résurrection : la colonne de lumière vient de l'effet de l'ulti, la carte se relève à mi-course
        const target = slot(e.side, e.index);
        const at = beat.t + TIMING.revive * 0.55;
        beat.event(at, e);
        beat.cue(at, { k: "number", slot: target, kind: "heal", amount: e.hp });
        beat.t += TIMING.revive;
        break;
      }
      case "heal": {
        const target = slot(e.side, e.index);
        // Après un K.-O. du même camp : soins de 遺言, portés par des feux follets
        if (lastKo && lastKo.side === e.side) {
          beat.cue(beat.t, { k: "passive", fx: "lastWill", slot: target, from: lastKo });
          beat.sound(beat.t, "wisp");
          beat.t += TIMING.wisp;
        }
        beat.event(beat.t, e);
        if (e.amount > 0) beat.cue(beat.t, { k: "number", slot: target, kind: "heal", amount: e.amount });
        beat.t += 220;
        break;
      }
      case "riposte": {
        // La carte touchée renvoie le coup une fois l'attaquant revenu à sa place
        releaseReturns();
        beat.t += TIMING.ret * 0.7;
        const riposter = slot(e.side, e.index);
        beat.event(beat.t, e);
        beat.cue(beat.t, { k: "passive", fx: "riposte", slot: riposter, from: attacker });
        beat.cue(beat.t, { k: "approach", actor: riposter, target: attacker, mode: "dash", ms: TIMING.riposte });
        beat.sound(beat.t, "slash");
        beat.t += TIMING.riposte;
        pendingReturns = [riposter];
        attacker = riposter;
        break;
      }
      case "barrier":
      case "buff":
      case "seal": {
        beat.event(beat.t, e);
        beat.t += 160;
        break;
      }
      default: {
        beat.event(beat.t, e);
        break;
      }
    }
  }
  releaseReturns();
}

function tickBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const e = events[i] as Extract<BattleEvent, { t: "poison" }>;
  const beat = new Draft("poison", b);
  const target = slot(e.side, e.index);
  beat.event(0, e);
  beat.cue(0, { k: "passive", fx: "poison", slot: target });
  beat.cue(0, { k: "number", slot: target, kind: "poison", amount: e.amount });
  beat.cue(0, { k: "shake", slot: target, power: 3 });
  beat.sound(0, "bubble");
  beat.t = TIMING.tick;
  let j = i + 1;
  while (j < events.length && !OPENS_BEAT.has(events[j].t)) j++;
  resolve(b, beat, target, events.slice(i + 1, j), { base: 1, returns: [], gap: 0 });
  b.beats.push(beat.done());
  return j;
}

function statusBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const beat = new Draft("status", b);
  beat.event(0, events[i]);
  beat.sound(0, "timeout");
  beat.t = TIMING.status;
  b.beats.push(beat.done(0));
  return i + 1;
}

function endBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const e = events[i] as Extract<BattleEvent, { t: "end" }>;
  const beat = new Draft("end", b);
  beat.event(0, e);
  const outcome = e.winner === null ? "draw" : e.winner === b.ctx.mySide ? "victory" : "defeat";
  beat.cue(0, { k: "arena", reaction: outcome });
  beat.sound(0, outcome);
  beat.t = TIMING.end;
  b.beats.push(beat.done(0));
  return i + 1;
}

/** Événement isolé (lot qui commence au milieu d'une action) : appliqué tel quel, chiffres compris. */
function looseBeat(b: Scene, events: readonly BattleEvent[], i: number): number {
  const beat = new Draft("loose", b);
  let j = i;
  while (j < events.length && !OPENS_BEAT.has(events[j].t)) j++;
  const first = events[i];
  const from = "side" in first && "index" in first ? slot(first.side, first.index) : slot(b.state.active, 0);
  resolve(b, beat, from, events.slice(i, j), { base: 1, returns: [], gap: 0 });
  b.beats.push(beat.done());
  return j;
}

/** Durée totale d'un lot mis en scène (à vitesse ×1). */
export function totalDuration(beats: readonly Beat[]): number {
  return beats.reduce((s, beat) => s + beat.duration, 0);
}
