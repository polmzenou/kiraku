"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyEvent, eventDuration } from "@/lib/battle/display";
import type { BattleEvent, BattleState, Side } from "@/lib/battle/types";
import type { Fx } from "./BattleFuda";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Batch = { events: BattleEvent[]; final: BattleState };

/**
 * Joue les événements du moteur un à un sur l'état affiché : élan de l'attaquant, chiffres qui
 * montent, PV qui baissent. À la fin de chaque lot, l'état du serveur fait foi. Avec
 * prefers-reduced-motion, tout s'applique d'un coup.
 */
export function useEventPlayer(initial: BattleState) {
  const reduced = useReducedMotion() ?? false;
  const [shown, setShown] = useState(initial);
  const [fx, setFx] = useState<Record<string, Fx[]>>({});
  const [lunge, setLunge] = useState<{ side: Side; index: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const queue = useRef<Batch[]>([]);
  const running = useRef(false);
  const fxId = useRef(0);
  const alive = useRef(true);
  const speed = useRef(1);
  /** Incrémenté par snap : le lot en cours s'interrompt. */
  const epoch = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const pushFx = useCallback((side: Side, index: number, f: Omit<Fx, "id">) => {
    const key = `${side}-${index}`;
    const id = ++fxId.current;
    setFx((cur) => ({ ...cur, [key]: [...(cur[key] ?? []), { ...f, id }] }));
    setTimeout(() => {
      if (alive.current) setFx((cur) => ({ ...cur, [key]: (cur[key] ?? []).filter((x) => x.id !== id) }));
    }, 950);
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setAnimating(true);
    while (queue.current.length > 0 && alive.current) {
      const batch = queue.current.shift()!;
      const my = epoch.current;
      let interrupted = false;
      for (const e of batch.events) {
        if (!alive.current) return;
        if (epoch.current !== my) {
          interrupted = true;
          break;
        }
        setShown((s) => applyEvent(s, e));
        if (e.t === "attack") setLunge({ side: e.side, index: e.actor });
        if (e.t === "damage") pushFx(e.side, e.index, { kind: e.crit ? "crit" : "damage", amount: e.amount });
        if (e.t === "heal" && e.amount > 0) pushFx(e.side, e.index, { kind: "heal", amount: e.amount });
        if (e.t === "poison") pushFx(e.side, e.index, { kind: "poison", amount: e.amount });
        if (e.t === "block") pushFx(e.side, e.index, { kind: "block", amount: 0 });
        const ms = eventDuration(e, reduced) / speed.current;
        if (ms > 0) await sleep(ms);
        if (e.t === "attack") setLunge(null);
      }
      if (!interrupted && epoch.current === my) setShown(batch.final);
    }
    running.current = false;
    if (alive.current) setAnimating(false);
  }, [pushFx, reduced]);

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
    setLunge(null);
    setFx({});
    setShown(state);
  }, []);

  const setSpeed = useCallback((v: number) => {
    speed.current = v;
  }, []);

  return { shown, fx, lunge, animating, play, snap, setSpeed, reduced };
}
