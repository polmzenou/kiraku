"use client";

import { useSyncExternalStore } from "react";

// Vitesse des animations du combat (×1, ×2, ×4), mémorisée dans ce navigateur. Sans stockage
// (navigation privée), le choix vaut pour la page.

export const SPEEDS = [1, 2, 4] as const;
export type BattleSpeed = (typeof SPEEDS)[number];

const KEY = "kiraku.battle.speed";
const listeners = new Set<() => void>();
let memory: BattleSpeed | null = null;

function read(): BattleSpeed {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return (SPEEDS as readonly number[]).includes(v) ? (v as BattleSpeed) : 1;
  } catch {
    return 1;
  }
}

export function setBattleSpeed(v: BattleSpeed) {
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    // stockage indisponible
  }
  memory = v;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBattleSpeed(): BattleSpeed {
  return useSyncExternalStore(subscribe, () => memory ?? (memory = read()), () => 1);
}
