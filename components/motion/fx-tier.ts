"use client";

import { useSyncExternalStore } from "react";
import { readStoredTier, storedTier, tierFromFrames, tierFromHints, type FxTier } from "@/lib/fx/perf-tier";

// Niveau d'effets mesuré sur cet appareil (réglage « auto ») : une valeur partagée hors React,
// mémorisée dans le navigateur, que les composants lisent avec useMeasuredTier().

const STORAGE_KEY = "kiraku-fx-tier";

let tier: FxTier | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    tier = readStoredTier(localStorage.getItem(STORAGE_KEY), Date.now());
  } catch {
    tier = null;
  }
  if (tier === null) {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    tier = tierFromHints({ cores: nav.hardwareConcurrency, memory: nav.deviceMemory, saveData: nav.connection?.saveData });
  }
}

function set(next: FxTier, remember: boolean) {
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, storedTier(next, Date.now()));
    } catch {
      // Stockage indisponible (navigation privée) : la mesure vaut pour la session
    }
  }
  if (tier === next) return;
  tier = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Niveau mesuré, ou null tant que rien n'est connu (on garde alors les effets complets). */
export function useMeasuredTier(): FxTier | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return tier;
    },
    () => null,
  );
}

/** Un niveau est déjà connu pour cet appareil (mesure récente ou indice matériel net). */
export function hasMeasuredTier() {
  load();
  return tier !== null;
}

/**
 * Enregistre les écarts entre images pendant `ms` millisecondes, puis rend son verdict. Rien n'est
 * mesuré si l'onglet passe en arrière-plan (les images y sont suspendues).
 */
export function probeFrames(ms: number): () => void {
  const deltas: number[] = [];
  let last = 0;
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    if (document.hidden) return stop();
    if (last) deltas.push(now - last);
    last = now;
    if (now - start < ms) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    const verdict = tierFromFrames(deltas);
    if (verdict) set(verdict, true);
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * Surveille la fluidité pendant une animation lourde (révélation des cartes) : si une fenêtre de
 * 60 images est saccadée, les effets passent en allégé pour la suite, et c'est mémorisé.
 * Ne remonte jamais vers « complet » : seule une nouvelle mesure au repos le peut.
 */
export function watchFrames(): () => void {
  let deltas: number[] = [];
  let last = 0;
  let frame = 0;
  const step = (now: number) => {
    if (document.hidden) {
      last = 0;
      deltas = [];
    } else {
      if (last) deltas.push(now - last);
      last = now;
      if (deltas.length >= 60) {
        if (tierFromFrames(deltas) === "lite") {
          set("lite", true);
          frame = 0;
          return;
        }
        deltas = [];
      }
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}
