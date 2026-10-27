"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useClock, useFormatCountdown } from "./useBoosterClock";
import { refreshWhenVisible } from "../realtime/refresh-when-visible";

/**
 * « Se termine dans 2 j 4 h » : fin d'un booster limité (Focus série, bannière). À zéro, la page est
 * redemandée au serveur, qui ne propose plus le booster. Le client n'affiche qu'un compte à rebours.
 */
export function EndsIn({ endsAt, serverNow, className = "" }: { endsAt: number; serverNow: number; className?: string }) {
  const t = useTranslations("boosters");
  const format = useFormatCountdown({ days: true });
  const now = useClock(serverNow);
  const router = useRouter();
  const refreshed = useRef(false);
  const remaining = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remaining > 0 || refreshed.current) return;
    refreshed.current = true;
    return refreshWhenVisible(() => router.refresh());
  }, [remaining, router]);

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
