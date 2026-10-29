"use client";

import { useCallback, useEffect, useRef } from "react";
import { nextPollDelay, pollOnResume } from "@/lib/realtime/schedule";
import { getActivity, subscribeActivity } from "./activity";
import { useRealtime } from "./RealtimeProvider";

type Options = {
  /** Délai de base sans temps réel (s). */
  seconds: number;
  /** Délai de secours quand Ably est connecté (s) ; absent = ce sondage ne dépend pas d'Ably. */
  realtimeSeconds?: number;
  enabled?: boolean;
  /** Ralentit le sondage quand `poll` renvoie false (rien de neuf). */
  backoff?: boolean;
  /**
   * Canal temps réel dont dépend ce sondage : le délai de secours ne s'applique que s'il est vraiment
   * attaché (un canal refusé garde le délai de base). Absent = la connexion seule suffit.
   */
  channel?: "user" | { battle: string };
};

/** Écart sous lequel la reconnexion du temps réel ne relance pas un sondage qui vient de partir. */
const RESYNC_GAP_MS = 2_000;

/**
 * Sondage partagé par tous les écrans : rien quand l'onglet est caché ou le joueur inactif, reprise
 * immédiate à son retour si le dernier sondage est ancien, délai de secours quand le temps réel est
 * connecté. `poll` renvoie true quand quelque chose a changé (remet le délai à la base).
 * Renvoie `pollNow` pour un sondage immédiat (événement temps réel, action du joueur).
 */
export function usePoll(poll: () => Promise<boolean | void>, { seconds, realtimeSeconds, enabled = true, backoff = false, channel }: Options) {
  const { connected: open, isLive, backoffMax } = useRealtime();
  const connected = channel ? isLive(channel) : open;
  const pollRef = useRef(poll);
  // Heure du dernier sondage ; au montage, celle du rendu serveur (rien à rattraper tout de suite)
  const lastAt = useRef(0);
  const unchanged = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    clearTimeout(timer.current);
    lastAt.current = Date.now();
    try {
      const changed = await pollRef.current();
      unchanged.current = changed === false ? unchanged.current + 1 : 0;
    } catch {
      // Réseau coupé : on réessaiera au prochain tour
    } finally {
      running.current = false;
      scheduleRef.current();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (lastAt.current === 0) lastAt.current = Date.now();
    let stopped = false;
    const schedule = () => {
      clearTimeout(timer.current);
      if (stopped) return;
      const delay = nextPollDelay({
        baseSeconds: seconds,
        realtimeSeconds,
        realtimeConnected: connected,
        hidden: document.visibilityState !== "visible",
        idle: !getActivity().active,
        unchanged: backoff ? unchanged.current : 0,
        backoffMax,
      });
      if (delay === null) return;
      timer.current = setTimeout(() => void run(), Math.max(0, lastAt.current + delay - Date.now()));
    };
    scheduleRef.current = schedule;
    const onActivity = () => {
      if (getActivity().active && pollOnResume(lastAt.current, Date.now(), seconds)) {
        unchanged.current = 0;
        void run();
      } else {
        schedule();
      }
    };
    schedule();
    const stop = subscribeActivity(onActivity);
    return () => {
      stopped = true;
      stop();
      clearTimeout(timer.current);
      scheduleRef.current = () => {};
    };
  }, [backoff, backoffMax, connected, enabled, realtimeSeconds, run, seconds]);

  // Reconnexion du temps réel (retour sur l'onglet, coupure réseau) : on rattrape ce qui a pu manquer
  const wasConnected = useRef(connected);
  const everConnected = useRef(connected);
  useEffect(() => {
    // La première connexion suit le rendu serveur : rien à rattraper
    const reconnected = connected && !wasConnected.current && everConnected.current;
    wasConnected.current = connected;
    if (connected) everConnected.current = true;
    // Au retour sur l'onglet, le geste du joueur a souvent déjà relancé un sondage : pas de second à la suite
    if (enabled && reconnected && realtimeSeconds !== undefined && Date.now() - lastAt.current > RESYNC_GAP_MS) void run();
  }, [connected, enabled, realtimeSeconds, run]);

  return run;
}
