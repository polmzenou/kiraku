"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { countdownParts } from "@/lib/time";

// Horloge partagée à la seconde : premier rendu à l'heure du serveur (pas d'écart d'hydratation),
// puis l'heure du navigateur recalée sur celle du serveur. Le client affiche un compte à rebours, il ne
// décide jamais du stock.

// Une seule minuterie pour toute la page, quel que soit le nombre de comptes à rebours abonnés
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
const subscribe = (tick: () => void) => {
  listeners.add(tick);
  ticker ??= setInterval(() => {
    for (const listener of listeners) listener();
  }, 1000);
  return () => {
    listeners.delete(tick);
    if (listeners.size > 0 || !ticker) return;
    clearInterval(ticker);
    ticker = null;
  };
};
// Écart entre l'heure du serveur et celle de l'appareil, mesuré une fois au montage. Un téléphone en
// avance atteignait zéro trop tôt : le serveur renvoyait la même échéance et l'écran restait figé.
let skew: number | null = null;
const secondNow = () => Math.floor((Date.now() + (skew ?? 0)) / 1000) * 1000;

export function useClock(serverNow: number) {
  useEffect(() => {
    skew ??= serverNow - Date.now();
  }, [serverNow]);
  return useSyncExternalStore(subscribe, secondNow, () => serverNow);
}

// Échéances déjà rafraîchies, pour toute la page : plusieurs comptes à rebours sur le même `nextAt`
// (panneau, vitrine, récap) ne demandent qu'un seul nouveau rendu serveur. Si le serveur renvoie encore
// la même échéance, nouvel essai un peu plus tard, trois fois au plus.
const refreshed = new Map<number, { at: number; count: number }>();
const RETRY_MS = 15_000;
const MAX_REFRESHES = 3;

/**
 * Temps restant avant `nextAt` (null si le stock est plein). À zéro, redemande la page au serveur,
 * qui recalcule le stock ; onglet caché, au retour seulement.
 */
export function useBoosterCountdown(nextAt: number | null, serverNow: number) {
  const now = useClock(serverNow);
  const router = useRouter();
  const remaining = nextAt === null ? null : Math.max(0, nextAt - now);

  useEffect(() => {
    if (nextAt === null || remaining !== 0) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      const seen = refreshed.get(nextAt);
      if (seen && (seen.count >= MAX_REFRESHES || Date.now() - seen.at < RETRY_MS)) return;
      if (document.visibilityState !== "visible") return;
      refreshed.set(nextAt, { at: Date.now(), count: (seen?.count ?? 0) + 1 });
      router.refresh();
      retry = setTimeout(go, RETRY_MS);
    };
    go();
    document.addEventListener("visibilitychange", go);
    return () => {
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", go);
    };
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
