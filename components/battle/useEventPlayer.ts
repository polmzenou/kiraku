"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyEvent, eventDuration } from "@/lib/battle/display";
import type { BattleEvent, BattleState, Side } from "@/lib/battle/types";
import type { Fx } from "./BattleFuda";
import { useReducedFx } from "@/components/motion/MotionPreference";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (side: Side, index: number) => `${side}-${index}`;

type Batch = { events: BattleEvent[]; final: BattleState };

/** Durée d'une charge (aller, frappe, retour) ; l'impact tombe à IMPACT_AT. */
const STRIKE_MS = 720;
const IMPACT_AT = 0.5;

/**
 * Joue les événements du moteur un à un sur l'état affiché, façon jeu de cartes : l'attaquant se
 * soulève, fonce sur sa cible et revient (Web Animations, transform seulement), la cible tremble,
 * les chiffres éclatent. À la fin de chaque lot, l'état du serveur fait foi. Avec
 * prefers-reduced-motion, tout s'applique sans mouvement.
 */
export function useEventPlayer(initial: BattleState) {
  const reduced = useReducedFx();
  const [shown, setShown] = useState(initial);
  const [fx, setFx] = useState<Record<string, Fx[]>>({});
  const [animating, setAnimating] = useState(false);
  /** Dernier événement notable, pour le journal et la bannière de tour. */
  const [feed, setFeed] = useState<{ id: number; event: BattleEvent }[]>([]);
  const queue = useRef<Batch[]>([]);
  const running = useRef(false);
  const fxId = useRef(0);
  const alive = useRef(true);
  const speed = useRef(1);
  const epoch = useRef(0);
  const cards = useRef(new Map<string, HTMLElement>());
  const board = useRef<HTMLElement | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Ref à poser sur l'enveloppe de chaque fuda du plateau. */
  const cardRef = useCallback(
    (side: Side, index: number) => (el: HTMLElement | null) => {
      if (el) cards.current.set(key(side, index), el);
      else cards.current.delete(key(side, index));
    },
    [],
  );

  const boardRef = useCallback((el: HTMLElement | null) => {
    board.current = el;
  }, []);

  const pushFx = useCallback((side: Side, index: number, f: Omit<Fx, "id">) => {
    const k = key(side, index);
    const id = ++fxId.current;
    setFx((cur) => ({ ...cur, [k]: [...(cur[k] ?? []), { ...f, id }] }));
    setTimeout(() => {
      if (alive.current) setFx((cur) => ({ ...cur, [k]: (cur[k] ?? []).filter((x) => x.id !== id) }));
    }, 1_500);
  }, []);

  /** Secousse d'une carte (ou du plateau) : quelques allers-retours rapides. */
  const shake = useCallback(
    (el: HTMLElement | null | undefined, strength: number) => {
      if (!el || reduced) return;
      const s = strength;
      el.animate(
        [
          { transform: "translate(0, 0)" },
          { transform: `translate(${-s}px, ${s * 0.4}px) rotate(${-s * 0.3}deg)` },
          { transform: `translate(${s}px, ${-s * 0.3}px) rotate(${s * 0.3}deg)` },
          { transform: `translate(${-s * 0.6}px, 0)` },
          { transform: `translate(${s * 0.4}px, 0)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 320, easing: "ease-out" },
      );
    },
    [reduced],
  );

  /**
   * Charge de l'attaquant vers sa cible ; la promesse se résout au moment de l'impact (la suite —
   * dégâts, secousse — s'affiche quand la carte touche). Sans cible (乱舞, 鼓舞…), la carte se dresse.
   */
  const strike = useCallback(
    async (side: Side, actor: number, targetSide: Side, target: number | null) => {
      const a = cards.current.get(key(side, actor));
      const ms = STRIKE_MS / speed.current;
      if (!a || reduced) return;
      a.style.zIndex = "30";
      const t = target === null ? null : cards.current.get(key(targetSide, target));
      let anim: Animation;
      if (!t || t === a) {
        anim = a.animate(
          [
            { transform: "translateY(0) scale(1)" },
            { transform: `translateY(${side === targetSide ? -6 : -18}px) scale(1.14) rotate(-2deg)`, offset: 0.4 },
            { transform: "translateY(0) scale(1)" },
          ],
          { duration: ms * 0.8, easing: "ease-in-out" },
        );
      } else {
        const ra = a.getBoundingClientRect();
        const rt = t.getBoundingClientRect();
        const dx = rt.left + rt.width / 2 - (ra.left + ra.width / 2);
        const dy = rt.top + rt.height / 2 - (ra.top + ra.height / 2);
        // S'arrête juste avant le centre de la cible : les cartes se percutent sans se recouvrir
        const reach = 1 - Math.min(0.45, (rt.height * 0.55) / Math.max(1, Math.hypot(dx, dy)));
        const tilt = dx > 0 ? 6 : dx < 0 ? -6 : 0;
        anim = a.animate(
          [
            { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 0 },
            { transform: `translate(${-dx * 0.05}px, ${-dy * 0.07}px) scale(1.16) rotate(${-tilt}deg)`, offset: 0.28, easing: "cubic-bezier(.6,0,.9,.5)" },
            { transform: `translate(${dx * reach}px, ${dy * reach}px) scale(1.1) rotate(${tilt * 0.5}deg)`, offset: IMPACT_AT, easing: "ease-out" },
            { transform: `translate(${dx * reach * 0.86}px, ${dy * reach * 0.86}px) scale(1.06) rotate(0deg)`, offset: 0.62, easing: "ease-in-out" },
            { transform: "translate(0, 0) scale(1) rotate(0deg)", offset: 1 },
          ],
          { duration: ms },
        );
      }
      void anim.finished.then(
        () => (a.style.zIndex = ""),
        () => (a.style.zIndex = ""),
      );
      await sleep(ms * (t ? IMPACT_AT : 0.4));
    },
    [reduced],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setAnimating(true);
    while (queue.current.length > 0 && alive.current) {
      const batch = queue.current.shift()!;
      const my = epoch.current;
      let interrupted = false;
      let pendingCrit = false;
      for (const e of batch.events) {
        if (!alive.current) return;
        if (epoch.current !== my) {
          interrupted = true;
          break;
        }
        setFeed((cur) => [...cur.slice(-40), { id: ++fxId.current, event: e }]);
        if (e.t === "attack") {
          // Charge : l'état ne bouge qu'à l'impact
          const targetSide = e.technique && ["IYASHI", "SHUGO"].includes(e.technique) ? e.side : ((e.side === 0 ? 1 : 0) as Side);
          await strike(e.side, e.actor, targetSide, e.target);
          continue;
        }
        setShown((s) => applyEvent(s, e));
        if (e.t === "damage") {
          pendingCrit = e.crit;
          pushFx(e.side, e.index, { kind: "impact", amount: 0, crit: e.crit });
          pushFx(e.side, e.index, { kind: e.crit ? "crit" : "damage", amount: e.amount });
          shake(cards.current.get(key(e.side, e.index)), e.crit ? 9 : 5);
          if (e.crit) shake(board.current, 4);
        }
        if (e.t === "heal" && e.amount > 0) pushFx(e.side, e.index, { kind: "heal", amount: e.amount });
        if (e.t === "poison") {
          pushFx(e.side, e.index, { kind: "poison", amount: e.amount });
          shake(cards.current.get(key(e.side, e.index)), 3);
        }
        if (e.t === "block") pushFx(e.side, e.index, { kind: "block", amount: 0 });
        if (e.t === "ko" && !reduced) {
          cards.current.get(key(e.side, e.index))?.animate(
            [
              { transform: "scale(1) rotate(0deg)", opacity: 1 },
              { transform: "scale(1.06) rotate(-2deg)", opacity: 1, offset: 0.25 },
              { transform: "scale(0.94) rotate(3deg)", opacity: 0.7 },
            ],
            { duration: 520, easing: "ease-in" },
          );
        }
        const ms = (eventDuration(e, reduced) + (e.t === "damage" && pendingCrit ? 220 : 0)) / speed.current;
        if (ms > 0) await sleep(ms);
      }
      if (!interrupted && epoch.current === my) setShown(batch.final);
    }
    running.current = false;
    if (alive.current) setAnimating(false);
  }, [pushFx, reduced, shake, strike]);

  /** Ajoute un lot d'événements à jouer, suivi de l'état du serveur. */
  const play = useCallback(
    (events: BattleEvent[], final: BattleState) => {
      queue.current.push({ events, final });
      void run();
    },
    [run],
  );

  /** Saute à un état sans animation (resynchronisation, aller à la fin). */
  const snap = useCallback((state: BattleState) => {
    epoch.current += 1;
    queue.current = [];
    setFx({});
    setShown(state);
  }, []);

  const setSpeed = useCallback((v: number) => {
    speed.current = v;
  }, []);

  return { shown, fx, feed, animating, play, snap, setSpeed, reduced, cardRef, boardRef };
}
