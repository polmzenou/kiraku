"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker à chaque visite (page hors ligne et Web Push) ; un navigateur déjà à
 * jour ne refait rien. L'abonnement push, lui, reste un choix du joueur (PushToggle).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    // Après le chargement : l'installation ne concurrence pas l'affichage de la page
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
