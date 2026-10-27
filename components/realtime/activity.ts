"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isIdle } from "@/lib/realtime/schedule";

// Présence du joueur, partagée par tous les sondages et la connexion temps réel : onglet visible et
// geste récent. Un seul jeu d'écouteurs pour toute la page.

export type Activity = { active: boolean };

let idleSeconds = 300;
let lastInputAt = 0;
let state: Activity = { active: true };
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
// Écrans d'attente (salon, file, combat) : le joueur regarde sans toucher, l'inactivité ne compte pas
let holds = 0;
const listeners = new Set<() => void>();

function compute(): boolean {
  return document.visibilityState === "visible" && (holds > 0 || !isIdle(lastInputAt, Date.now(), idleSeconds));
}

function update() {
  const active = compute();
  if (active !== state.active) {
    state = { active };
    for (const l of listeners) l();
  }
  clearTimeout(idleTimer);
  if (active && holds === 0) idleTimer = setTimeout(update, Math.max(1000, lastInputAt + idleSeconds * 1000 - Date.now()));
}

function onInput() {
  const now = Date.now();
  // Un geste par seconde suffit : le défilement en émet des dizaines
  if (now - lastInputAt < 1000) return;
  lastInputAt = now;
  if (!state.active) update();
}

function start() {
  if (started) return;
  started = true;
  lastInputAt = Date.now();
  const opts = { passive: true, capture: true } as const;
  for (const type of ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const) window.addEventListener(type, onInput, opts);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lastInputAt = Date.now();
    update();
  });
  update();
}

/** Délai d'inactivité (activity.idleSeconds), fixé par le RealtimeProvider. */
export function configureActivity(seconds: number) {
  idleSeconds = seconds;
  if (started) update();
}

export function subscribeActivity(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivity(): Activity {
  return state;
}

/** Tant que le composant est monté, le joueur n'est jamais tenu pour inactif (onglet caché, si). */
export function useHoldAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    holds += 1;
    if (started) update();
    return () => {
      holds -= 1;
      lastInputAt = Date.now();
      if (started) update();
    };
  }, [enabled]);
}

const SERVER: Activity = { active: true };

/** Le joueur est-il là (onglet visible, geste récent) ? */
export function useActivity(): boolean {
  return useSyncExternalStore(subscribeActivity, getActivity, () => SERVER).active;
}
