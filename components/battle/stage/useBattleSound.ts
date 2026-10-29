"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRitualFx } from "@/components/opening/useRitualFx";
import type { ArenaId } from "@/lib/battle/arenas";
import { primeAudio } from "@/lib/sound/synth";
import type { SoundPort } from "./useDirector";

// Son du combat : la préférence de l'ouverture (kiraku.sound, coupée par défaut) vaut aussi ici, la
// musique a la sienne (kiraku.music, allumée par défaut). Le moteur de sons n'est chargé qu'une fois le
// son activé ; l'ambiance se tait quand l'onglet est caché.

const MUSIC_KEY = "kiraku.music";
const listeners = new Set<() => void>();
let musicMemory: boolean | null = null;

function readMusic(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeMusic(on: boolean) {
  try {
    window.localStorage.setItem(MUSIC_KEY, on ? "on" : "off");
  } catch {
    // stockage indisponible : le choix vaut pour cette page
  }
  musicMemory = on;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Engine = typeof import("@/lib/sound/battle");
let engine: Promise<Engine> | null = null;
const load = () => (engine ??= import("@/lib/sound/battle"));

export function useBattleSound(arena: ArenaId, active: boolean) {
  const { enabled, setEnabled } = useRitualFx();
  const music = useSyncExternalStore(subscribe, () => musicMemory ?? (musicMemory = readMusic()), () => true);
  const port = useRef<SoundPort | null>(null);
  const eng = useRef<Engine | null>(null);
  const musicRef = useRef(music);
  useEffect(() => {
    musicRef.current = music;
  }, [music]);

  useEffect(() => {
    if (!enabled) {
      port.current = null;
      return;
    }
    let cancelled = false;
    void load().then((e) => {
      if (cancelled) return;
      eng.current = e;
      port.current = { play: (name) => e.playBattleSound(name) };
      if (active && !document.hidden) e.startAmbience(arena, musicRef.current);
    });
    return () => {
      cancelled = true;
      eng.current?.stopAmbience();
    };
  }, [active, arena, enabled]);

  useEffect(() => {
    eng.current?.setAmbienceMusic(music);
  }, [music]);

  useEffect(() => {
    if (!enabled || !active) return;
    const sync = () => {
      if (document.hidden) eng.current?.stopAmbience();
      else eng.current?.startAmbience(arena, musicRef.current);
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [active, arena, enabled]);

  /** À appeler dans le geste du joueur : le contexte audio démarre alors à coup sûr (Safari). */
  const toggle = useCallback(
    (on: boolean) => {
      if (on) primeAudio();
      setEnabled(on);
    },
    [setEnabled],
  );

  return { port, enabled, setEnabled: toggle, music, setMusic: writeMusic };
}
