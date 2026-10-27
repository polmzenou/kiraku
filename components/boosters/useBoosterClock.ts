"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { countdownParts } from "@/lib/time";

// Horloge partagée à la seconde : premier rendu à l'heure du serveur (pas d'écart d'hydratation),
// puis l'heure du navigateur. Le client affiche un compte à rebours, il ne décide jamais du stock.

const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
const secondNow = () => Math.floor(Date.now() / 1000) * 1000;

export function useClock(serverNow: number) {
  return useSyncExternalStore(subscribe, secondNow, () => serverNow);
}

// Échéances déjà rafraîchies, pour toute la page : plusieurs comptes à rebours sur le même `nextAt`
// (panneau, vitrine, récap) ne demandent qu'un seul nouveau rendu serveur
const refreshed = new Set<number>();

/**
 * Temps restant avant `nextAt` (null si le stock est plein). À zéro, redemande la page au serveur,
 * qui recalcule le stock ; onglet caché, au retour seulement.
 */
export function useBoosterCountdown(nextAt: number | null, serverNow: number) {
  const now = useClock(serverNow);
  const router = useRouter();
  const remaining = nextAt === null ? null : Math.max(0, nextAt - now);

  useEffect(() => {
    if (nextAt === null || remaining !== 0 || refreshed.has(nextAt)) return;
    const go = () => {
      if (refreshed.has(nextAt) || document.visibilityState !== "visible") return;
      refreshed.add(nextAt);
      router.refresh();
    };
    go();
    document.addEventListener("visibilitychange", go);
    return () => document.removeEventListener("visibilitychange", go);
  }, [nextAt, remaining, router]);

  return remaining;
}

/** « 8 min 15 s » dans la langue courante ; `days` : « 2 j 4 h » au-delà de 24 h. */
export function useFormatCountdown(opts: { days?: boolean } = {}) {
  const t = useTranslations("time");
  const days = opts.days ?? false;
  return (ms: number) => {
    const p = countdownParts(ms, { days });
    if (p.unit === "dayHour") return t("dayHour", { days: p.days, hours: p.hours });
    if (p.unit === "hourMin") return t("hourMin", { hours: p.hours, minutes: p.minutes });
    if (p.unit === "minSec") return t("minSec", { minutes: p.minutes, seconds: p.seconds });
    return t("sec", { seconds: p.seconds });
  };
}
