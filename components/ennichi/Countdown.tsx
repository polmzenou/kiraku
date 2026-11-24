"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compte à rebours de la fête (jours, heures, minutes), recalculé toutes les 30 secondes. */
export function Countdown({ target, serverNow }: { target: string; serverNow: string }) {
  const t = useTranslations("ennichi.countdown");
  // Décalage de l'horloge du joueur par rapport au serveur, pris une fois au montage
  const [skew] = useState(() => Date.now() - new Date(serverNow).getTime());
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const tick = () => setNow(Date.now() - skew);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [skew]);
  const ms = Math.max(0, new Date(target).getTime() - now);
  if (ms === 0) return <span className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-bold text-text-muted">{t("done")}</span>;
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    <span className="countdown" role="timer" aria-label={t("aria", { days: d, hours: h, minutes: m })}>
      <span aria-hidden="true">
        {d}
        <small>{t("days", { count: d })}</small>
      </span>
      <span aria-hidden="true">
        {pad(h)}
        <small>{t("hours")}</small>
      </span>
      <span aria-hidden="true">
        {pad(m)}
        <small>{t("minutes")}</small>
      </span>
    </span>
  );
}
