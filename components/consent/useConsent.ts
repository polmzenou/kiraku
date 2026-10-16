"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_CHANGE_EVENT, hasConsent } from "@/lib/consent/consent";
import { readConsent } from "@/lib/consent/consent-dom";
import type { ConsentCategory } from "@/lib/consent/registry";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
}

/** Un script de cette catégorie peut-il être chargé ? false au rendu serveur et avant tout choix. */
export function useConsent(category: ConsentCategory): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasConsent(readConsent(), category, Date.now()),
    () => category === "necessary",
  );
}
