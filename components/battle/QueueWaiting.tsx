"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { leaveQueueAction, pollQueueAction, startBotBattleAction, type BattleActionError } from "@/server/actions/battle";
import { useHoldAwake } from "../realtime/activity";
import { useRealtime } from "../realtime/RealtimeProvider";
import { Button } from "../ui/Button";
import { useBattleError } from "./useBattleError";
import { useTickingNow } from "./useTickingNow";

/**
 * Attente en file : un ensō qui tourne, le temps écoulé, Annuler. Le sondage prouve qu'on est
 * toujours là et retente l'appariement ; à l'heure prévue, un bot prend la place de l'adversaire.
 * Un adversaire trouvé par l'autre joueur arrive en direct (« matched » sur le canal du joueur).
 */
export function QueueWaiting({
  joinedAt,
  botAt,
  pollSeconds,
  botOnDemand,
  serverNow,
  onLeft,
}: {
  joinedAt: string;
  botAt: string;
  pollSeconds: number;
  /** Bouton « Combattre contre un bot » avant l'heure (en classé, selon ranked.botOnDemand ; le serveur revérifie). */
  botOnDemand: boolean;
  /** Heure du rendu serveur (ms) : compteurs identiques au rendu serveur et à l'hydratation. */
  serverNow: number;
  onLeft: (error?: BattleActionError) => void;
}) {
  const t = useTranslations("battle.queue");
  const router = useRouter();
  const errorText = useBattleError();
  const now = useTickingNow(serverNow, 500);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Relance la boucle de sondage après une sortie de file ratée (elle s'arrête dès qu'on part)
  const [restart, setRestart] = useState(0);
  const botRequested = useRef(false);
  const done = useRef(false);
  const start = new Date(joinedAt).getTime();
  const bot = new Date(botAt).getTime();
  const { subscribe } = useRealtime();
  useHoldAwake();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Démontage ou redémarrage pendant une requête : la boucle s'arrête au lieu de se reprogrammer sans composant
    let cancelled = false;
    // Essais du bot espacés après un refus passager (réseau, rate limit, indisponible) : 1 s, 2 s, 5 s, puis 5 s
    let botRetries = 0;
    let botRetryAt = 0;
    const go = (battleId: string) => {
      done.current = true;
      router.push(`/combat/${battleId}`);
    };
    const poll = async () => {
      if (done.current || cancelled) return;
      try {
        // L'heure du bot est passée : on le demande (le serveur revérifie l'attente)
        if (Date.now() >= bot && !botRequested.current && Date.now() >= botRetryAt) {
          botRequested.current = true;
          const res = await startBotBattleAction();
          if (cancelled) return;
          if (res.ok) return go(res.battleId);
          if (res.error === "IN_BATTLE" && res.battleId) return go(res.battleId);
          if (res.error === "NOT_QUEUED" || res.error === "DISABLED" || res.error === "NO_BOT_CARDS") {
            // Refus définitif : plus rien à attendre dans cette file
            done.current = true;
            return onLeft(res.error);
          }
          // Refus passager (TOO_EARLY compris : horloge en avance, délai relevé par l'admin) : nouvel essai plus tard
          botRequested.current = false;
          botRetryAt = Date.now() + [1_000, 2_000, 5_000][Math.min(botRetries, 2)];
          botRetries += 1;
        }
        const res = await pollQueueAction();
        if (cancelled) return;
        if (res.ok && res.state === "MATCHED") return go(res.battleId);
        if (res.ok && res.state === "NONE") {
          done.current = true;
          return onLeft();
        }
      } catch {
        // Réseau coupé : on retente au prochain tour (le bot aussi)
        botRequested.current = false;
      }
      if (cancelled) return;
      // Le bot ne doit pas attendre un tour de sondage de plus que prévu ; une fois son heure passée, rythme normal
      const untilBot = bot - Date.now();
      timer = setTimeout(poll, untilBot > 0 ? Math.max(500, Math.min(pollSeconds * 1000, untilBot + 250)) : Math.min(pollSeconds * 1000, 5_000));
    };
    timer = setTimeout(poll, 600);
    const unsubscribe = subscribe("user", "matched", (data) => {
      const battleId = (data as { battleId?: unknown }).battleId;
      if (typeof battleId === "string" && !done.current) go(battleId);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [bot, onLeft, pollSeconds, restart, router, subscribe]);

  const leave = async () => {
    setLeaving(true);
    setError(null);
    done.current = true;
    const res = await leaveQueueAction().catch(() => null);
    if (res?.ok && res.state === "MATCHED") return router.push(`/combat/${res.battleId}`);
    // Sortie faite (ou déjà hors file), ou plus de session : l'accueil reprend la main
    if (res && (res.ok || res.error === "NO_SESSION" || res.error === "GUEST")) return onLeft(res.ok ? undefined : res.error);
    // Action qui lève (serveur injoignable) ou refus passager (rate limit, indisponible) : la place et l'équipe
    // restent prises côté serveur, on reste donc en file, bouton et sondage rendus ; le sondage dira si la
    // sortie a quand même eu lieu
    if (res) setError(errorText(res.error));
    done.current = false;
    setLeaving(false);
    setRestart((n) => n + 1);
  };

  // Le joueur ne veut pas attendre : bot tout de suite (un vrai adversaire arrivé entre-temps reste prioritaire côté serveur)
  const fightBot = async () => {
    setLeaving(true);
    botRequested.current = true;
    try {
      const res = await startBotBattleAction({ skipWait: true });
      const battleId = res.ok ? res.battleId : res.error === "IN_BATTLE" ? res.battleId : undefined;
      if (battleId) {
        done.current = true;
        return router.push(`/combat/${battleId}`);
      }
      if (!res.ok && res.error === "NOT_QUEUED") {
        done.current = true;
        return onLeft();
      }
    } catch {
      // Réseau coupé : on reste en file, le sondage continue
    }
    botRequested.current = false;
    setLeaving(false);
  };

  const elapsed = Math.max(0, Math.floor((now - start) / 1_000));
  const untilBot = Math.max(0, Math.ceil((bot - now) / 1_000));

  // Les compteurs (role="timer") ne sont pas relus à chaque seconde : seule la petite région polie annonce
  // les changements d'état (recherche, bot imminent)
  return (
    <section className="flex flex-col items-center gap-5 lacquer rounded-card px-4 py-8 text-center">
      <span aria-hidden="true" className="relative inline-flex size-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-4 border-border" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-shu [animation-duration:1.6s] motion-reduce:animate-none" />
        <span className="max-w-20 text-sm font-bold text-shu">
          {t("searching")}
        </span>
      </span>
      <p aria-live="polite" className="sr-only">
        {untilBot > 0 ? t("searching") : t("botNow")}
      </p>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-bold">{t("title")}</h2>
        <p role="timer" className="text-2xl font-bold tabular-nums">
          {t("elapsed", { seconds: elapsed })}
        </p>
        <p role="timer" className="text-sm text-text-muted">
          {untilBot > 0 ? t("botSoon", { seconds: untilBot }) : t("botNow")}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {botOnDemand && untilBot > 0 && (
          <Button variant="primary" onClick={fightBot} disabled={leaving}>
            {t("fightBot")}
          </Button>
        )}
        <Button onClick={leave} disabled={leaving}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
