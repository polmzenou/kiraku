"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  choreograph,
  EMPTY_MEMORY,
  TIMING,
  type ArenaReaction,
  type BattleSound,
  type Cue,
  type FxLevel,
  type ImpactStyle,
  type Slot,
  type StageMemory,
} from "@/lib/battle/choreography";
import { applyEvent } from "@/lib/battle/display";
import type { BattleEvent, BattleSetup, BattleState, Side, Technique } from "@/lib/battle/types";
import { resolveAppearance } from "@/lib/catalog/appearance";
import * as vfx from "../fx/vfx";

// Metteur en scène du combat : joue les temps forts de lib/battle/choreography sur une horloge
// virtuelle (vitesse ×1, ×2, ×4, passage accéléré d'un toucher, ralenti du coup de grâce), lance les
// effets (Web Animations, transform et opacity seulement) et tient l'état affiché à jour avec
// applyEvent. À la fin de chaque lot, l'état du serveur fait foi. Le CSS global des animations
// réduites ne couvre pas element.animate() : en mouvement réduit, la chorégraphie ne pose aucun
// mouvement et tout tombe à 0 ms.

export type StageNumber = { id: number; kind: "damage" | "crit" | "heal" | "poison" | "block"; amount: number };
export type CardEls = { root: HTMLElement; move: HTMLElement; hit: HTMLElement; flash: HTMLElement | null; crack: HTMLElement | null };
export type ArenaHandle = { react(reaction: ArenaReaction, side?: Side): void; camera?(dx: number, dy: number, zoom: number, ms: number): void };
export type SoundPort = { play(name: BattleSound): void };
export type CutIn = { id: number; actor: Slot; technique: Technique; full: boolean; ms: number };
export type Banner = { id: number; side: Side; turn: number; ms: number };

type Batch = { events: BattleEvent[]; final: BattleState };

const key = (s: Slot) => `${s.side}-${s.index}`;
const SPRING = "cubic-bezier(.34,1.5,.64,1)";

export type DirectorOptions = {
  setup: BattleSetup;
  mySide: Side;
  level: FxLevel;
  style: ImpactStyle;
  speed: number;
  sound?: { current: SoundPort | null };
  arena?: { current: ArenaHandle | null };
};

export function useDirector(initial: BattleState, opts: DirectorOptions) {
  const [shown, setShownState] = useState(initial);
  const [numbers, setNumbers] = useState<Record<string, StageNumber[]>>({});
  const [feed, setFeed] = useState<{ id: number; event: BattleEvent }[]>([]);
  const [animating, setAnimating] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [cutin, setCutin] = useState<CutIn | null>(null);
  const [light, setLight] = useState<Side>(initial.active);
  const [faces, setFaces] = useState<Record<string, "back" | "front">>({});

  const shownRef = useRef(initial);
  const queue = useRef<Batch[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const seq = useRef(0);
  const memory = useRef<StageMemory>(EMPTY_MEMORY);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const cards = useRef(new Map<string, CardEls>());
  const world = useRef<HTMLElement | null>(null);
  const rig = useRef<HTMLElement | null>(null);
  const shaker = useRef<HTMLElement | null>(null);
  const layer = useRef<HTMLElement | null>(null);
  const screen = useRef<HTMLElement | null>(null);
  const approaches = useRef(new Map<string, { anim: Animation; last: string }>());

  // ---------- Horloge virtuelle ----------
  const anims = useRef(new Set<Animation>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const wakers = useRef(new Set<() => void>());
  const accel = useRef(1);
  const slow = useRef(1);
  const clock = useRef({ v: 0, real: 0, rate: 1 });
  const rate = () => Math.max(0.1, optsRef.current.speed * accel.current * slow.current);
  const vnow = () => clock.current.v + (performance.now() - clock.current.real) * clock.current.rate;

  const applyRate = useCallback(() => {
    const r = rate();
    clock.current = { v: vnow(), real: performance.now(), rate: r };
    for (const a of anims.current) {
      try {
        a.updatePlaybackRate(r);
      } catch {
        // Animation déjà terminée
      }
    }
    wakers.current.forEach((w) => w());
  }, []);

  useEffect(() => {
    applyRate();
  }, [opts.speed, applyRate]);

  const track = useCallback((a: Animation) => {
    a.playbackRate = clock.current.rate;
    anims.current.add(a);
    const drop = () => anims.current.delete(a);
    a.finished.then(drop, drop);
    return a;
  }, []);

  /** Attend l'heure virtuelle `target` ; se relève tout de suite si la vitesse change ou si le lot est interrompu. */
  const until = useCallback((target: number, my: number) => {
    return new Promise<void>((resolve) => {
      let id: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (id) clearTimeout(id);
        wakers.current.delete(tick);
        resolve();
      };
      const tick = () => {
        if (epoch.current !== my || !alive.current) return done();
        const left = target - vnow();
        if (left <= 0.5) return done();
        if (id) clearTimeout(id);
        id = setTimeout(tick, left / clock.current.rate);
      };
      wakers.current.add(tick);
      tick();
    });
  }, []);

  /** Effet décalé en temps virtuel (sceau à l'arrivée d'un ofuda, retrait d'un chiffre). */
  const later = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms / clock.current.rate);
    timers.current.add(id);
  }, []);

  const animate = useCallback(
    (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => track(el.animate(frames, { fill: "both", easing: "cubic-bezier(.16,.84,.3,1)", ...o })),
    [track],
  );

  useEffect(() => {
    alive.current = true;
    const ids = timers.current;
    const running = anims.current;
    return () => {
      alive.current = false;
      ids.forEach(clearTimeout);
      running.forEach((a) => a.cancel());
    };
  }, []);

  // ---------- Registre des éléments ----------
  const register = useCallback((slot: Slot, els: CardEls | null) => {
    if (els) cards.current.set(key(slot), els);
    else cards.current.delete(key(slot));
  }, []);
  /** La scène pose ses éléments ici (effet de mise en page) : repère, caméra, secousse et calques d'effets. */
  const bindStage = useCallback((els: { world: HTMLElement; rig: HTMLElement; shaker: HTMLElement; layer: HTMLElement; screen: HTMLElement } | null) => {
    world.current = els?.world ?? null;
    rig.current = els?.rig ?? null;
    shaker.current = els?.shaker ?? null;
    layer.current = els?.layer ?? null;
    screen.current = els?.screen ?? null;
  }, []);

  const fxRun = useCallback((): vfx.FxRun | null => {
    if (!world.current || !layer.current || !screen.current) return null;
    return { world: world.current, layer: layer.current, screen: screen.current, lite: optsRef.current.level !== "full", track };
  }, [track]);

  const boxOf = (s: Slot): vfx.Box | null => {
    const el = cards.current.get(key(s))?.move;
    return el && world.current ? vfx.boxOf(el, world.current) : null;
  };
  const art = (s: Slot): vfx.Art => {
    const card = optsRef.current.setup.teams[s.side][s.index];
    const look = resolveAppearance(undefined, card.appearance);
    return { src: card.imageUrl, focalX: look.focalX, focalY: look.focalY };
  };

  const setShown = useCallback((next: BattleState | ((s: BattleState) => BattleState)) => {
    shownRef.current = typeof next === "function" ? next(shownRef.current) : next;
    setShownState(shownRef.current);
  }, []);

  // ---------- Repères ----------
  const pushNumber = (slot: Slot, kind: StageNumber["kind"], amount: number) => {
    const k = key(slot);
    const id = ++seq.current;
    setNumbers((cur) => ({ ...cur, [k]: [...(cur[k] ?? []), { id, kind, amount }] }));
    later(1_500, () => setNumbers((cur) => ({ ...cur, [k]: (cur[k] ?? []).filter((x) => x.id !== id) })));
  };

  const approach = (c: Extract<Cue, { k: "approach" }>) => {
    const a = cards.current.get(key(c.actor));
    if (!a) return;
    a.root.style.zIndex = "20";
    let frames: Keyframe[];
    let last: string;
    const t = c.target ? cards.current.get(key(c.target)) : null;
    if (c.mode === "dash" && t && t !== a) {
      const ra = a.move.getBoundingClientRect();
      const rt = t.move.getBoundingClientRect();
      const dx = rt.left + rt.width / 2 - (ra.left + ra.width / 2);
      const dy = rt.top + rt.height / 2 - (ra.top + ra.height / 2);
      // S'arrête juste avant le centre de la cible : les cartes se percutent sans se recouvrir
      const reach = 1 - Math.min(0.5, (rt.height * 0.6) / Math.max(1, Math.hypot(dx, dy)));
      const tilt = dx > 0 ? 7 : dx < 0 ? -7 : 0;
      last = `translate(${dx * reach}px, ${dy * reach}px) scale(.97, 1.07) rotate(${tilt * 0.5}deg)`;
      frames = [
        { transform: "translate(0px, 0px) scale(1, 1) rotate(0deg)" },
        { transform: `translate(${-dx * 0.07}px, ${-dy * 0.09}px) scale(1.06, .92) rotate(${-tilt}deg)`, offset: 0.55, easing: "cubic-bezier(.7,0,.95,.5)" },
        { transform: last },
      ];
      const run = fxRun();
      const from = boxOf(c.actor);
      const to = boxOf(c.target!);
      if (run && from && to) later(c.ms * 0.55, () => vfx.streaks(run, from, to));
    } else {
      last = `translate(0px, ${-a.move.offsetHeight * 0.12}px) scale(1.08, 1.08) rotate(-2deg)`;
      frames = [{ transform: "translate(0px, 0px) scale(1, 1) rotate(0deg)" }, { transform: last }];
    }
    const anim = animate(a.move, frames, { duration: c.ms, fill: "forwards", easing: c.mode === "dash" ? "linear" : "cubic-bezier(.2,.8,.3,1)" });
    approaches.current.set(key(c.actor), { anim, last });
  };

  const goBack = (c: Extract<Cue, { k: "return" }>) => {
    const a = cards.current.get(key(c.actor));
    const prev = approaches.current.get(key(c.actor));
    if (!a || !prev) return;
    approaches.current.delete(key(c.actor));
    prev.anim.cancel();
    const anim = animate(a.move, [{ transform: prev.last }, { transform: "translate(0px, 0px) scale(1, 1) rotate(0deg)" }], {
      duration: c.ms,
      fill: "none",
      easing: SPRING,
    });
    const reset = () => (a.root.style.zIndex = "");
    anim.finished.then(reset, reset);
  };

  const shake = (el: HTMLElement | null | undefined, power: number) => {
    if (!el) return;
    const s = optsRef.current.level === "full" ? power : power * 0.6;
    animate(
      el,
      [
        { transform: "translate(0px, 0px)" },
        { transform: `translate(${-s}px, ${s * 0.4}px) rotate(${-s * 0.25}deg)` },
        { transform: `translate(${s}px, ${-s * 0.3}px) rotate(${s * 0.25}deg)` },
        { transform: `translate(${-s * 0.6}px, ${s * 0.2}px)` },
        { transform: `translate(${s * 0.35}px, 0px)` },
        { transform: "translate(0px, 0px)" },
      ],
      { duration: 340, easing: "ease-out", fill: "none", composite: "add" },
    );
  };

  const camera = (c: Extract<Cue, { k: "camera" }>) => {
    if (c.mode === "slowmo") {
      slow.current = 0.35;
      applyRate();
      setTimeout(() => {
        slow.current = 1;
        applyRate();
      }, c.ms);
      return;
    }
    const r = rig.current;
    const target = c.slot ? boxOf(c.slot) : null;
    if (!r || !target || !world.current) return;
    const w = world.current.clientWidth;
    const h = world.current.clientHeight;
    const dx = (target.x - w / 2) * -0.035;
    const dy = (target.y - h / 2) * -0.035;
    animate(r, [{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(1.035)`, offset: 0.28 }, { transform: "translate(0px, 0px) scale(1)" }], {
      duration: c.ms,
      fill: "none",
      easing: "cubic-bezier(.2,.8,.3,1)",
    });
    optsRef.current.arena?.current?.camera?.(dx, dy, 1.035, c.ms);
  };

  const impact = (c: Extract<Cue, { k: "impact" }>) => {
    const t = cards.current.get(key(c.slot));
    const run = fxRun();
    const to = boxOf(c.slot);
    if (!t || !run || !to) return;
    const from = c.from ? boxOf(c.from) : null;
    vfx.impact(run, to, from, c.power, c.crit);
    vfx.cardFlash(run, t.flash, c.power);
    if (c.power >= 2) vfx.cardCrack(run, t.crack);
    if (c.crit) vfx.shock(run, to, to.w * 2.4, "kin");
    const len = from ? Math.hypot(to.x - from.x, to.y - from.y) || 1 : 1;
    const ux = from ? (to.x - from.x) / len : 0;
    const uy = from ? (to.y - from.y) / len : -1;
    const k = 5 + c.power * 4;
    animate(
      t.hit,
      [
        { transform: "translate(0px, 0px) rotate(0deg)" },
        { transform: `translate(${ux * k}px, ${uy * k}px) rotate(${(ux >= 0 ? 1 : -1) * c.power * 2.5}deg)`, offset: 0.32 },
        { transform: "translate(0px, 0px) rotate(0deg)" },
      ],
      { duration: 440, delay: c.stop, fill: "none", easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  };

  const frame = (c: Extract<Cue, { k: "frame" }>) => {
    const run = fxRun();
    const to = boxOf(c.to);
    const from = boxOf(c.from);
    if (!run || !to || !from) return;
    if (c.style === "sumi") vfx.frameSumi(run, to, c.finisher, c.ms);
    if (c.style === "koma") vfx.frameKoma(run, to, art(c.from), art(c.to), c.finisher, c.ms);
    if (c.style === "mie") {
      optsRef.current.sound?.current?.play("clack");
      vfx.frameMie(run, from, to, c.finisher, c.ms);
      const a = cards.current.get(key(c.from));
      if (a) {
        animate(a.hit, [{ transform: "scale(1) rotate(0deg)" }, { transform: "scale(1.14) rotate(-6deg)", offset: 0.2, easing: SPRING }, { transform: "scale(1.14) rotate(-6deg)", offset: 0.8 }, { transform: "scale(1) rotate(0deg)" }], {
          duration: c.ms,
          fill: "none",
          composite: "add",
        });
      }
    }
  };

  const technique = (c: Extract<Cue, { k: "technique" }>) => {
    const run = fxRun();
    const from = boxOf(c.actor);
    if (!run || !from) return;
    const targets = c.targets.map(boxOf).filter((b): b is vfx.Box => b !== null);
    const first = targets[0];
    switch (c.technique) {
      case "ISSEN":
        if (first) vfx.slash(run, first);
        break;
      case "KANTSU":
        if (first) vfx.pierce(run, from, first);
        break;
      case "RANBU":
        vfx.bladeStorm(run, targets);
        break;
      case "IYASHI":
        if (first) vfx.healColumn(run, first);
        break;
      case "SHUGO":
        if (first) vfx.kekkai(run, first);
        break;
      case "KOBU":
        targets.forEach((t, i) => vfx.flames(run, t, i * 70));
        break;
      case "FUIN":
        if (first) {
          vfx.ofudaThrow(run, from, first, TIMING.seal);
          later(TIMING.seal, () => {
            const again = fxRun();
            if (again) vfx.stamp(again, first, "封", "shu", 700);
          });
        }
        break;
    }
  };

  const passive = (c: Extract<Cue, { k: "passive" }>) => {
    const run = fxRun();
    const at = boxOf(c.slot);
    if (!run || !at) return;
    const from = c.from ? boxOf(c.from) : null;
    switch (c.fx) {
      case "block":
        vfx.shieldBreak(run, at, from);
        break;
      case "poisoned":
        vfx.poisonSeep(run, at);
        break;
      case "poison":
        vfx.bubbles(run, at);
        break;
      case "riposte":
        vfx.glint(run, at);
        break;
      case "lastWill":
        if (from) vfx.wisp(run, from, at, TIMING.wisp);
        break;
      case "revive":
        vfx.revive(run, at);
        break;
      case "flurry":
        vfx.flurry(run, at);
        break;
      case "taunt":
        vfx.taunt(run, at);
        break;
    }
  };

  const orbs = (c: Extract<Cue, { k: "orbs" }>) => {
    const before = shownRef.current.orbs;
    setShown((s) => ({ ...s, orbs: c.count }));
    if (!c.spentBy || !world.current) return;
    const run = fxRun();
    const to = boxOf(c.spentBy);
    const src = world.current.querySelector(`[data-orbs="${c.side}"]`);
    if (!run || !to || !src) return;
    const from = vfx.boxOf(src, world.current);
    for (let i = 0; i < Math.max(0, before - c.count); i++) vfx.orbFly(run, from, to, i);
  };

  const dispatch = (cue: Cue) => {
    const o = optsRef.current;
    switch (cue.k) {
      case "banner":
        setBanner({ id: ++seq.current, side: cue.side, turn: cue.turn, ms: TIMING.turn / clock.current.rate });
        break;
      case "light":
        setLight(cue.side);
        break;
      case "orbs":
        orbs(cue);
        break;
      case "approach":
        approach(cue);
        break;
      case "return":
        goBack(cue);
        break;
      case "hitstop":
        break;
      case "impact":
        impact(cue);
        break;
      case "frame":
        frame(cue);
        break;
      case "number":
        pushNumber(cue.slot, cue.kind, cue.amount);
        break;
      case "shake":
        shake(cue.slot ? cards.current.get(key(cue.slot))?.hit : shaker.current, cue.power);
        break;
      case "camera":
        camera(cue);
        break;
      case "cutin": {
        const id = ++seq.current;
        setCutin({ id, actor: cue.actor, technique: cue.technique, full: cue.full, ms: cue.ms / clock.current.rate });
        later(cue.ms, () => setCutin((cur) => (cur?.id === id ? null : cur)));
        break;
      }
      case "technique":
        technique(cue);
        break;
      case "passive":
        passive(cue);
        break;
      case "ko": {
        const run = fxRun();
        const at = boxOf(cue.slot);
        if (run && at) {
          vfx.ash(run, at);
          vfx.stamp(run, at, "撃破", "shu", 1_100);
          if (cue.finisher) vfx.shock(run, at, Math.max(at.w, at.h) * 3, "shu");
        }
        break;
      }
      case "arena":
        o.arena?.current?.react(cue.reaction, cue.side);
        break;
      case "sound":
        o.sound?.current?.play(cue.name);
        break;
    }
  };

  // ---------- Déroulé ----------
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setAnimating(true);
    while (queue.current.length > 0 && alive.current) {
      const batch = queue.current.shift()!;
      const my = epoch.current;
      const o = optsRef.current;
      const res = choreograph(batch.events, { setup: o.setup, state: shownRef.current, mySide: o.mySide, level: o.level, style: o.style, memory: memory.current });
      memory.current = res.memory;
      let interrupted = false;
      for (const beat of res.beats) {
        const start = vnow();
        for (const step of beat.steps) {
          if (step.at > 0) await until(start + step.at, my);
          if (epoch.current !== my || !alive.current) {
            interrupted = true;
            break;
          }
          if (step.event) {
            const e = step.event;
            setShown((s) => applyEvent(s, e));
            setFeed((cur) => [...cur.slice(-40), { id: ++seq.current, event: e }]);
          }
          if (step.cue) dispatch(step.cue);
        }
        if (interrupted) break;
        await until(start + beat.duration, my);
        if (epoch.current !== my) {
          interrupted = true;
          break;
        }
      }
      if (!interrupted && epoch.current === my) setShown(batch.final);
    }
    running.current = false;
    if (accel.current !== 1) {
      accel.current = 1;
      applyRate();
    }
    if (alive.current) setAnimating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyRate, setShown, until]);

  /** Ajoute un lot d'événements à jouer, suivi de l'état du serveur. */
  const play = useCallback(
    (events: BattleEvent[], final: BattleState) => {
      queue.current.push({ events, final });
      void run();
    },
    [run],
  );

  /** Saute à un état sans animation (resynchronisation, aller à la fin, recommencer). */
  const snap = useCallback(
    (state: BattleState) => {
      epoch.current += 1;
      queue.current = [];
      memory.current = EMPTY_MEMORY;
      for (const a of anims.current) a.cancel();
      approaches.current.clear();
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      cards.current.forEach((c) => (c.root.style.zIndex = ""));
      setNumbers({});
      setCutin(null);
      setBanner(null);
      setLight(state.active);
      setShown(state);
    },
    [setShown],
  );

  /** Un toucher pendant une séquence : la suite défile quatre fois plus vite. */
  const accelerate = useCallback(() => {
    if (!running.current || accel.current !== 1) return;
    accel.current = 4;
    applyRate();
  }, [applyRate]);

  /**
   * Distribution de l'entrée : les cartes partent du paquet face cachée, se posent avec un anneau de
   * poussière, puis se retournent une à une (l'adversaire d'abord). Rien en mouvement réduit.
   */
  const dealToken = useRef(0);
  const dealAnims = useRef(new Set<Animation>());
  const deal = useCallback(
    async (order: Slot[]) => {
      const my = epoch.current;
      const token = ++dealToken.current;
      const reduced = optsRef.current.level === "reduced";
      setFaces(Object.fromEntries(order.map((s) => [key(s), reduced ? "front" : "back"])));
      if (reduced) return;
      const start = vnow();
      order.forEach((s, i) => {
        const c = cards.current.get(key(s));
        if (!c) return;
        const fromTop = s.side !== optsRef.current.mySide;
        const dy = (fromTop ? -1 : 1) * (world.current?.clientHeight ?? 800) * 0.55;
        const a = animate(c.move, [
          { transform: `translate(${(i % 3 - 1) * -30}px, ${dy}px) rotate(${fromTop ? 160 : -160}deg) scale(.7)`, opacity: 0 },
          { transform: "translate(0px, -14px) rotate(-4deg) scale(1.04)", opacity: 1, offset: 0.8 },
          { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 },
        ], { duration: 520, delay: i * 90, fill: "backwards", easing: "cubic-bezier(.2,.75,.3,1)" });
        dealAnims.current.add(a);
        later(i * 90 + 470, () => {
          if (dealToken.current !== token) return;
          const run = fxRun();
          const b = boxOf(s);
          if (run && b) vfx.dust(run, b);
          optsRef.current.sound?.current?.play("swing");
        });
      });
      await until(start + order.length * 90 + 640, my);
      for (let i = 0; i < order.length; i++) {
        if (epoch.current !== my || dealToken.current !== token) return;
        const s = order[i];
        setFaces((cur) => ({ ...cur, [key(s)]: "front" }));
        optsRef.current.sound?.current?.play("orb");
        await until(vnow() + 150, my);
      }
      await until(vnow() + 420, my);
    },
    [animate, fxRun, later, until],
  );

  /** Entrée passée d'un toucher : la distribution se termine d'un coup, toutes les cartes face visible. */
  const finishDeal = useCallback(() => {
    dealToken.current += 1;
    dealAnims.current.forEach((a) => {
      try {
        a.finish();
      } catch {
        // déjà terminée
      }
    });
    dealAnims.current.clear();
    setFaces({});
  }, []);

  return {
    shown,
    numbers,
    feed,
    animating,
    banner,
    cutin,
    light,
    faces,
    play,
    snap,
    accelerate,
    deal,
    finishDeal,
    register,
    bindStage,
  };
}

export type Director = ReturnType<typeof useDirector>;
