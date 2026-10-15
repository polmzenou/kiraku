"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { leaveQueueAction, pollQueueAction, startBotBattleAction, type BattleActionError } from "@/server/actions/battle";
import { Button } from "../ui/Button";

const POLL_MS = 2_500;

/**
 * Attente en file : un ensō qui tourne, le temps écoulé, Annuler. Le sondage prouve qu'on est
 * toujours là et retente l'appariement ; à l'heure prévue, un bot prend la place de l'adversaire.
 */
export function QueueWaiting({ joinedAt, botAt, onLeft }: { joinedAt: string; botAt: string; onLeft: (error?: BattleActionError) => void }) {
  const t = useTranslations("battle.queue");
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const botRequested = useRef(false);
  const done = useRef(false);
  const start = new Date(joinedAt).getTime();
  const bot = new Date(botAt).getTime();

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const go = (battleId: string) => {
      done.current = true;
      router.push(`/combat/${battleId}`);
    };
    const poll = async () => {
      if (done.current) return;
      try {
        // L'heure du bot est passée : on le demande (le serveur revérifie l'attente)
        if (Date.now() >= bot && !botRequested.current) {
          botRequested.current = true;
          const res = await startBotBattleAction();
          if (res.ok) return go(res.battleId);
          if (res.error === "IN_BATTLE" && res.battleId) return go(res.battleId);
          botRequested.current = res.error === "TOO_EARLY" ? false : true;
        }
        const res = await pollQueueAction();
        if (res.ok && res.state === "MATCHED") return go(res.battleId);
        if (res.ok && res.state === "NONE") {
          done.current = true;
          return onLeft();
        }
      } catch {
        // Réseau coupé : on retente au prochain tour
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, 600);
    return () => clearTimeout(timer);
  }, [bot, onLeft, router]);

  const leave = async () => {
    setLeaving(true);
    done.current = true;
    const res = await leaveQueueAction();
    if (res.ok && res.state === "MATCHED") return router.push(`/combat/${res.battleId}`);
    onLeft(res.ok ? undefined : res.error);
  };

  const elapsed = Math.max(0, Math.floor((now - start) / 1_000));
  const untilBot = Math.max(0, Math.ceil((bot - now) / 1_000));

  return (
    <section aria-live="polite" className="flex flex-col items-center gap-5 rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <span aria-hidden="true" className="relative inline-flex size-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-4 border-border" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-shu [animation-duration:1.6s] motion-reduce:animate-none" />
        <span lang="ja" className="font-seal text-3xl text-shu">
          戦
        </span>
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-xl font-bold">{t("title")}</h2>
        <p className="text-2xl font-bold tabular-nums">{t("elapsed", { seconds: elapsed })}</p>
        <p className="text-sm text-text-muted">{untilBot > 0 ? t("botSoon", { seconds: untilBot }) : t("botNow")}</p>
      </div>
      <Button onClick={leave} disabled={leaving}>
        {t("cancel")}
      </Button>
    </section>
  );
}
