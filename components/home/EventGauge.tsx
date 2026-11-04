"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventGaugeView } from "@/lib/home/event-gauge";
import { eventGaugeAction } from "@/server/actions/home";
import { useBoosterCountdown, useFormatCountdown } from "../boosters/useBoosterClock";
import { useReducedFx } from "../motion/MotionPreference";
import { usePoll } from "../realtime/usePoll";
import { SectionTitle } from "../SectionTitle";
import { ButtonLink } from "../ui/ButtonLink";

export type EventGaugeCta = "signup" | "invite" | null;

/**
 * Jauge communautaire au-dessus de la vitrine : les ouvertures des joueurs inscrits la font monter. Le
 * client affiche, le serveur compte. Sondée seulement quand elle est à l'écran pendant l'event ; à
 * chaque échéance, la page est redemandée au serveur, qui donne la nouvelle phase.
 */
export function EventGauge({ initial, refreshSeconds, serverNow, cta }: {
  initial: EventGaugeView;
  refreshSeconds: number;
  serverNow: number;
  cta: EventGaugeCta;
}) {
  const t = useTranslations("home.eventGauge");
  const format = useFormatter();
  const formatTime = useFormatCountdown({ days: true });
  const reduced = useReducedFx();
  const [gauge, setGauge] = useState(initial);
  const { phase, count, goal, ratio, percent, reached } = gauge;
  const deadline = phase === "upcoming" ? gauge.startsAt : phase === "live" ? gauge.endsAt : null;
  const remaining = useBoosterCountdown(deadline, serverNow);

  const section = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lastCount = useRef(initial.count);
  const refresh = useCallback(async () => {
    const res = await eventGaugeAction({});
    if (!res.ok) return false;
    setGauge(res.gauge);
    const changed = res.gauge.count !== lastCount.current;
    lastCount.current = res.gauge.count;
    return changed;
  }, []);
  usePoll(refresh, { seconds: refreshSeconds, enabled: phase === "live" && inView, backoff: true });

  const counts = { count: format.number(count), goal: format.number(goal) };
  const message = phase === "ended"
    ? t(reached ? "endedReached" : "endedMissed", counts)
    : reached
      ? t("reached")
      : t("rules", { goal: counts.goal });

  return (
    <section ref={section} aria-labelledby="event-gauge" className="flex flex-col gap-3 lacquer rounded-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <SectionTitle id="event-gauge" kanji="祭" title={t("title")} />
        <p className="text-xs font-bold tabular-nums text-text-muted">
          {remaining === null ? t("ended") : t(phase === "upcoming" ? "startsIn" : "endsIn", { time: formatTime(remaining) })}
        </p>
      </div>

      <p className="text-sm text-text-muted">{message}</p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 tabular-nums">
          <p className="font-bold">{t("progress", counts)}</p>
          <p className="text-sm font-bold text-kin">{t("percent", { percent })}</p>
        </div>
        <div
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(count, goal)}
          aria-valuetext={t("progress", counts)}
          className="h-4 overflow-hidden rounded-full border border-border bg-surface-2"
        >
          <div
            style={{ transform: `scaleX(${ratio})` }}
            className={`h-full origin-left rounded-full bg-kin ${reduced ? "" : "transition-transform duration-700 ease-out"}`}
          />
        </div>
      </div>

      {phase !== "ended" && cta && (
        <ButtonLink href={cta === "signup" ? "/inscription" : "/parrainage"} variant={cta === "signup" ? "primary" : "secondary"} className="max-w-full self-start text-center whitespace-normal!">
          {t(cta === "signup" ? "ctaSignup" : "ctaInvite")}
        </ButtonLink>
      )}
    </section>
  );
}
