"use client";

import { useEffect } from "react";

/** Service worker qui porte l'abonnement Web Push (enregistré par PushToggle, portée « / »). */
export const PUSH_SW_URL = "/sw.js";

/**
 * Page rendue sans compte inscrit (déconnexion, session perdue, invité, qui ne peut pas s'abonner) : un abonnement
 * Web Push encore présent dans ce navigateur est celui du compte d'avant. On le résilie, sinon l'appareil (partagé)
 * continuerait d'afficher ses notifications ; le service push répond ensuite 410 au serveur, qui supprime la ligne
 * (server/push/send.ts). Ne rend rien.
 */
export function PushSessionGuard() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void navigator.serviceWorker
      .getRegistration(PUSH_SW_URL)
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => sub?.unsubscribe())
      .catch(() => undefined);
  }, []);
  return null;
}
