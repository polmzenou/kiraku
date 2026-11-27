"use client";

import { useEffect } from "react";
import { stripLocale } from "@/lib/legal/legal";

// Le cookie de session porte une date d'expiration fixée à sa pose (connexion, invité créé) : `auth()` prolonge la
// session en base à l'usage, mais lu dans un composant serveur il ne peut pas réécrire le cookie, qui expirait donc
// 90 jours après la connexion, même pour un joueur venu chaque jour (un invité y perdait sa progression). Une fois
// par jour au plus, la route de session d'Auth.js est relue : elle prolonge la ligne en base et repose le cookie.

const KEY = "kiraku.session-refreshed";
const EVERY_MS = 24 * 3_600_000;
const DELAY_MS = 3_000;
// Pages où l'identité change (connexion, inscription, nouveau mot de passe) : une relecture en vol pendant
// l'envoi du formulaire reposerait l'ancien jeton par-dessus le nouveau
const IDENTITY_PATHS = /^\/(connexion|inscription)(\/|$)/;

let doneThisLoad = false;

function lastRefresh(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    // Stockage bloqué (navigation privée) : une relecture par chargement de page
    return 0;
  }
}

/** Monté par le layout pour un joueur connecté (invité compris) ; ne rend rien. */
export function SessionRefresh() {
  useEffect(() => {
    if (doneThisLoad || Date.now() - lastRefresh() < EVERY_MS) return;
    const timer = window.setTimeout(() => {
      if (IDENTITY_PATHS.test(stripLocale(window.location.pathname))) return;
      doneThisLoad = true;
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then((res) => {
          if (!res.ok) return;
          try {
            localStorage.setItem(KEY, String(Date.now()));
          } catch {
            // Stockage bloqué : la prochaine page relira
          }
        })
        .catch(() => {
          // Hors ligne : la prochaine page relira
        });
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
