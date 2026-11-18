"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/lib/motion-pref-dom";

// Cérémonie d'ouverture, une fois par appareil : souvenir local (déclaré dans lib/consent/registry.ts).
// localStorage peut manquer (navigation privée) : on la rejoue alors au pire une fois par visite.
const KEY = "kiraku.casino-ceremony";
const listeners = new Set<() => void>();
let memory: boolean | null = null;

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "seen";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(KEY, "seen");
  } catch {
    // stockage indisponible : vaut pour cette page seulement
  }
  memory = true;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => memory ?? (memory = readSeen());

const InaugurationCeremony = dynamic(() => import("./InaugurationCeremony").then((m) => m.InaugurationCeremony), { ssr: false });

/**
 * Joue la cérémonie au premier passage dans le hall pendant la fenêtre de lancement (`due`, décidé par le
 * serveur). Mouvement réduit : jamais jouée, notée comme vue. Elle compte comme vue dès qu'elle démarre.
 */
export function CeremonyGate({ due }: { due: boolean }) {
  // Vu par défaut au rendu serveur et à l'hydratation : jamais de cérémonie dans le HTML
  const seen = useSyncExternalStore(subscribe, snapshot, () => true);
  const play = due && !seen;

  useEffect(() => {
    if (play && prefersReducedMotion()) markSeen();
  }, [play]);

  const done = useCallback(() => markSeen(), []);
  if (!play) return null;
  return <Ceremony onDone={done} />;
}

/** La cérémonie se note comme vue à son départ : fermer l'onglet au milieu ne la rejoue pas. */
function Ceremony({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, "seen");
    } catch {
      // indisponible : elle se rejouera à la prochaine visite
    }
  }, []);
  return <InaugurationCeremony onDone={onDone} />;
}
