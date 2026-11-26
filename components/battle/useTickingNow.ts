"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Heure de l'appareil, relue toutes les `stepMs` ms (arrondie au pas : rien ne change entre deux relèves).
 * Au rendu serveur et à l'hydratation, l'heure du rendu serveur (`serverNow`) : un compte à rebours écrit le
 * même texte des deux côtés (pas d'écart d'hydratation qui ferait tout rendre à nouveau), puis suit l'appareil.
 * Seul le composant qui l'appelle se re-rend à chaque relève.
 */
export function useTickingNow(serverNow: number, stepMs = 1_000) {
  const subscribe = useCallback(
    (tick: () => void) => {
      const id = setInterval(tick, stepMs);
      return () => clearInterval(id);
    },
    [stepMs],
  );
  const read = useCallback(() => Math.floor(Date.now() / stepMs) * stepMs, [stepMs]);
  return useSyncExternalStore(subscribe, read, () => serverNow);
}
