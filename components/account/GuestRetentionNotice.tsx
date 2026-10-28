"use client";

import { useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "../ui/Button";

// « Plus tard » masque le bandeau 24 h sur cet appareil (confort seulement : sans stockage, il reste)
const KEY = "kiraku.guestNotice.hiddenUntil";
const HIDE_MS = 24 * 3_600_000;

const noop = () => () => {};

function hiddenOnThisDevice(): boolean {
  try {
    return (Number(localStorage.getItem(KEY)) || 0) > Date.now();
  } catch {
    // Stockage bloqué : le bandeau reste affiché
    return false;
  }
}

/**
 * Bandeau des invités : sans compte, la progression est supprimée après guest.retentionDays jours
 * sans visite (cron des comptes). Textes traduits côté serveur (AppHeader).
 */
export function GuestRetentionNotice({ text, cta, later }: { text: string; cta: string; later: string }) {
  // Masqué au rendu serveur, lu sur l'appareil ensuite : pas d'écart d'hydratation
  const hiddenStored = useSyncExternalStore(noop, hiddenOnThisDevice, () => true);
  const [dismissed, setDismissed] = useState(false);
  if (hiddenStored || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + HIDE_MS));
    } catch {
      // Stockage bloqué : masqué pour cette page seulement
    }
  };

  return (
    <div role="status" className="border-b border-kin/40 bg-kin/10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>{text}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Link prefetch={false} href="/inscription" className={buttonClasses("primary")}>
            {cta}
          </Link>
          <button type="button" onClick={hide} className={buttonClasses("ghost")}>
            {later}
          </button>
        </div>
      </div>
    </div>
  );
}
