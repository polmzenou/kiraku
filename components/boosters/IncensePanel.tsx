"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { activateIncenseAction } from "@/server/actions/incense";
import type { IncenseState } from "@/server/boosters/incense";
import { Button } from "../ui/Button";
import { useBoosterCountdown } from "./useBoosterClock";

/** « 11:59:42 » : heures, minutes, secondes (les heures peuvent dépasser 24 après plusieurs Encens). */
function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Encens du joueur (accueil et profil) : nombre d'Encens à activer, progression vers le prochain,
 * bouton d'activation et minuteur du boost en cours. Le serveur décide de tout : le client n'envoie
 * que l'intention d'activer et n'affiche qu'un compte à rebours.
 */
export function IncensePanel({ state }: { state: IncenseState }) {
  const t = useTranslations("incense");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const remaining = useBoosterCountdown(state.activeUntil, state.serverNow);
  const active = remaining !== null && remaining > 0;
  const progress = state.cardStep > 0 ? (state.cardStep - state.toNext) / state.cardStep : 0;
  const boost = t("boost", { rarity: tRarity(state.boostFrom), factor: format.number(state.factor, { maximumFractionDigits: 1 }) });

  const activate = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await activateIncenseAction({});
        if (!res.ok) setError(t(`errors.${res.error}`));
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  return (
    <section
      aria-labelledby="incense-title"
      className={`flex flex-col gap-3 rounded-card border bg-surface p-4 ${active ? "border-kin" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="incense-title" className="flex items-center gap-2 font-title text-lg font-bold">
          <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
            香
          </span>
          {t("title")}
          <span className="rounded-pill border border-kin/60 bg-bg/80 px-2 py-0.5 text-sm font-bold text-kin tabular-nums">
            {t("count", { count: state.available })}
          </span>
        </h2>
        <Button type="button" variant="primary" disabled={pending || state.available < 1} onClick={activate}>
          {active ? t("extend", { hours: state.durationHours }) : t("activate")}
        </Button>
      </div>

      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-kin/60 bg-kin/10 px-3 py-2">
          <p className="text-sm font-bold text-kin">{t("active", { boost })}</p>
          <p className="text-lg font-bold tabular-nums" role="timer" aria-label={t("timerLabel")}>
            {clock(remaining)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t("hint", { hours: state.durationHours, boost, step: state.cardStep })}</p>
      )}

      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={state.cardStep}
          aria-valuenow={state.cardStep - state.toNext}
          className="h-2 overflow-hidden rounded-pill bg-surface-2"
        >
          <div
            className="h-full origin-left rounded-pill bg-kin transition-transform duration-500 motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <p className="text-xs text-text-muted tabular-nums">{t("next", { count: state.toNext, step: state.cardStep })}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
    </section>
  );
}
