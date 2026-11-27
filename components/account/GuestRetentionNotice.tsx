"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { GUEST_NOTICE_COOKIE, GUEST_NOTICE_HIDE_SECONDS } from "@/lib/account/guest-retention";
import { buttonClasses } from "../ui/Button";

// « Plus tard » masque le bandeau 24 h sur cet appareil (confort seulement : sans cookie ni stockage, il reste).
// Le cookie est lu par le rendu serveur (AppHeader), qui ne rend plus le bandeau ; le stockage local garde les
// reports faits avant le cookie, recopiés dans le cookie à la visite suivante.
const KEY = "kiraku.guestNotice.hiddenUntil";

const noop = () => () => {};

/** Fin du report enregistrée sur cet appareil (0 : aucun report en cours). */
function hiddenUntil(): number {
  try {
    const until = Number(localStorage.getItem(KEY)) || 0;
    return until > Date.now() ? until : 0;
  } catch {
    // Stockage bloqué : le bandeau reste affiché
    return 0;
  }
}

function rememberHidden(seconds: number) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${GUEST_NOTICE_COOKIE}=1; path=/; max-age=${Math.max(1, Math.round(seconds))}; samesite=lax${secure}`;
}

/**
 * Bandeau des invités : sans compte, la progression est supprimée après guest.retentionDays jours
 * sans visite (cron des comptes). Textes traduits côté serveur (AppHeader).
 */
export function GuestRetentionNotice({ text, cta, later }: { text: string; cta: string; later: string }) {
  // Rendu serveur affiché (le serveur ne le rend pas pendant un report : cookie) ; un ancien report local le retire
  const storedUntil = useSyncExternalStore(noop, hiddenUntil, () => 0);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (storedUntil > 0) rememberHidden((storedUntil - Date.now()) / 1000);
  }, [storedUntil]);
  if (storedUntil > 0 || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    rememberHidden(GUEST_NOTICE_HIDE_SECONDS);
    try {
      localStorage.setItem(KEY, String(Date.now() + GUEST_NOTICE_HIDE_SECONDS * 1000));
    } catch {
      // Stockage bloqué : le cookie suffit
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
