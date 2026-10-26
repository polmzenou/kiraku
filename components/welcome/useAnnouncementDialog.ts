"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import type { AnnouncementKey } from "@/lib/welcome/release";
import { claimAnnouncementAction } from "@/server/actions/welcome";

// On attend un écran de découverte : aucune interruption d'ouverture, de combat ou de connexion.
const DISCOVERY_ROUTES = new Set(["", "wiki", "collection", "boutique", "amis", "marche", "compte", "missions", "classement", "parrainage", "notifications", "combat"]);

/**
 * Ouvre le modal d'une annonce une seule fois, sur un écran de découverte, quand aucune autre fenêtre
 * modale n'est ouverte et que le serveur a réservé l'affichage pour cet onglet.
 */
export function useAnnouncementDialog(userId: string, key: AnnouncementKey) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const handled = useRef(false);
  const claim = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const route = pathname.split("/")[1] ?? "";
    if (handled.current || !DISCOVERY_ROUTES.has(route) || (route === "combat" && pathname !== "/combat")) return;

    let cancelled = false;
    let timer: number;
    async function present() {
      const el = dialog.current;
      if (cancelled || !el) return;
      if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) {
        timer = window.setTimeout(() => void present(), 800);
        return;
      }
      try {
        // La promesse survit aux relances d'effet : jamais deux réservations pour ce composant.
        claim.current ??= claimAnnouncementAction(userId, key);
        const allowed = await claim.current;
        if (cancelled) return;
        if (allowed) {
          // Une autre fenêtre modale peut avoir été ouverte pendant la requête.
          if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) {
            timer = window.setTimeout(() => void present(), 800);
            return;
          }
          el.showModal();
          el.querySelector("h2")?.focus({ preventScroll: true });
        }
        handled.current = true;
      } catch {
        // Une indisponibilité réseau ne bloque jamais la page ; nouvel essai à la prochaine visite.
        claim.current = null;
      }
    }

    timer = window.setTimeout(() => void present(), 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, userId, key]);

  return dialog;
}
