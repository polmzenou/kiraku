"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCountdownClock, useFormatCountdown } from "./useBoosterClock";
import { refreshWhenVisible } from "../realtime/refresh-when-visible";

// Échéances déjà rafraîchies, pour toute la page : la bannière Focus et le hero de la vitrine affichent souvent la
// même fin, et chacun redemandait la page (deux rendus serveur complets de l'accueil)
const ended = new Set<number>();

/**
 * « Se termine dans 2 j 4 h » : fin d'un booster limité (Focus série, bannière). À zéro, la page est
 * redemandée au serveur, une seule fois par échéance, et il ne propose plus le booster. Le client n'affiche
 * qu'un compte à rebours, rendu seulement quand son texte change (à l'heure, à la minute, puis à la seconde).
 */
export function EndsIn({ endsAt, serverNow, className = "" }: { endsAt: number; serverNow: number; className?: string }) {
  const t = useTranslations("boosters");
  const format = useFormatCountdown({ days: true });
  const now = useCountdownClock(endsAt, serverNow, { days: true });
  const router = useRouter();
  const remaining = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remaining > 0 || ended.has(endsAt)) return;
    ended.add(endsAt);
    let done = false;
    const stop = refreshWhenVisible(() => {
      done = true;
      router.refresh();
    });
    return () => {
      stop();
      // Démonté avant le retour de l'onglet : l'échéance est libérée pour un compte à rebours monté ensuite
      if (!done) ended.delete(endsAt);
    };
  }, [remaining, endsAt, router]);

  return (
    <p className={`inline-flex items-center gap-1.5 tabular-nums ${className}`} aria-live="off">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {remaining > 0 ? t("endsIn", { time: format(remaining) }) : t("ended")}
    </p>
  );
}
