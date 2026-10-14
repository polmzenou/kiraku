"use client";

import { useCallback, useSyncExternalStore } from "react";
import { playSound, vibrate, type SoundName } from "@/lib/sound/synth";

// Son et vibrations de l'ouverture : coupés par défaut, choix mémorisé dans ce navigateur.
// localStorage peut être indisponible (navigation privée) : on retombe alors sur « coupé ».

const KEY = "kiraku.sound";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // stockage indisponible : le choix vaut pour cette page seulement
  }
  memory = on;
  listeners.forEach((l) => l());
}

let memory: boolean | null = null;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => memory ?? (memory = read());

export function useRitualFx() {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false);

  const play = useCallback(
    (name: SoundName, haptic?: number | number[]) => {
      if (!enabled) return;
      playSound(name);
      if (haptic !== undefined) vibrate(haptic);
    },
    [enabled],
  );

  return { enabled, setEnabled: write, play };
}
