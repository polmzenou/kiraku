"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { refreshWhenVisible } from "../realtime/refresh-when-visible";

/** Le compte à rebours reste à jour et renouvelle la sélection même si la page reste ouverte. */
export function MissionResetTimer({ endsAt, initialNow }: { endsAt: number; initialNow: number }) {
  const t = useTranslations("economy.missions");
  const router = useRouter();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    // Heure du serveur reportée sur l'horloge de l'appareil : un téléphone en avance rafraîchissait
    // avant le renouvellement et restait sur « renouvellement en cours »
    const skew = initialNow - Date.now();
    const serverTime = () => Date.now() + skew;
    const tick = setInterval(() => setNow(serverTime()), 60_000);
    let stopWaiting = () => {};
    const reset = setTimeout(() => (stopWaiting = refreshWhenVisible(() => router.refresh())), Math.max(0, endsAt - serverTime()) + 1_000);
    return () => { clearInterval(tick); clearTimeout(reset); stopWaiting(); };
  }, [endsAt, initialNow, router]);

  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return (
    <p className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted tabular-nums">
      {minutes === 0 ? t("refreshing") : hours >= 24
        ? t("resetsDays", { days: Math.floor(hours / 24), hours: hours % 24 })
        : t("resetsHours", { hours, minutes: minutes % 60 })}
    </p>
  );
}
