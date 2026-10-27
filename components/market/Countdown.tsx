"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useClock, useFormatCountdown } from "../boosters/useBoosterClock";
import { refreshWhenVisible } from "../realtime/refresh-when-visible";

/**
 * Temps restant avant la fin d'une vente, à la seconde. Le client affiche, le serveur décide : à
 * zéro, `refreshOnEnd` redemande la page (qui clôt la vente si besoin).
 */
export function Countdown({
  endsAt,
  serverNow,
  refreshOnEnd = false,
  className = "",
}: {
  endsAt: number;
  serverNow: number;
  refreshOnEnd?: boolean;
  className?: string;
}) {
  const t = useTranslations("market");
  const format = useFormatCountdown();
  const now = useClock(serverNow);
  const router = useRouter();
  const refreshed = useRef<number | null>(null);
  const remaining = Math.max(0, endsAt - now);

  useEffect(() => {
    if (!refreshOnEnd || remaining > 0 || refreshed.current === endsAt) return;
    refreshed.current = endsAt;
    return refreshWhenVisible(() => router.refresh());
  }, [refreshOnEnd, remaining, endsAt, router]);

  // Moins de 2 minutes : la fenêtre anti-sniping, en vermillon
  const urgent = remaining > 0 && remaining < 120_000;
  return (
    <span className={`tabular-nums ${urgent ? "font-bold text-shu" : ""} ${className}`}>
      {remaining > 0 ? t("endsIn", { time: format(remaining) }) : t("ended")}
    </span>
  );
}
