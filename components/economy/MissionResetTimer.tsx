"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { refreshWhenVisible } from "../realtime/refresh-when-visible";

/** Le compte à rebours reste à jour et renouvelle la sélection même si la page reste ouverte. */
export function MissionResetTimer({ endsAt, initialNow }: { endsAt: number; initialNow: number }) {
  const t = useTranslations("economy.missions");
  const router = useRouter();
  const [clock, setClock] = useState(initialNow);
  // Après le rafraîchissement de l'échéance, le composant reste monté : l'heure du nouveau rendu serveur
  // l'emporte sur le dernier tic d'avant minuit (sinon « 1 j 0 h » au lieu de « 23 h 59 min »)
  const now = Math.max(clock, initialNow);

  useEffect(() => {
    // Heure du serveur reportée sur l'horloge de l'appareil : un téléphone en avance rafraîchissait
    // avant le renouvellement et restait sur « renouvellement en cours »
    const skew = initialNow - Date.now();
    const serverTime = () => Date.now() + skew;
    const tick = setInterval(() => setClock(serverTime()), 60_000);
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopWaiting = () => {};
    // Comme ShopCountdown : léger décalage tiré au hasard (les onglets ouverts ne frappent pas la base à minuit
    // pile), et jamais pendant la révélation d'une carte gagnée (dialog ouvert)
    const refresh = () => {
      if (document.querySelector("dialog[open]")) retry = setTimeout(refresh, 5_000);
      else stopWaiting = refreshWhenVisible(() => router.refresh());
    };
    const due = Math.max(0, endsAt - serverTime());
    // « Renouvellement… » dès l'échéance, sans attendre le tic suivant
    const reached = setTimeout(() => setClock(serverTime()), due);
    const reset = setTimeout(refresh, due + 1_000 + Math.floor(Math.random() * 30_000));
    return () => {
      clearInterval(tick);
      clearTimeout(reached);
      clearTimeout(reset);
      clearTimeout(retry);
      stopWaiting();
    };
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
