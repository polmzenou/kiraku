"use client";

import { domAnimation, LazyMotion, m } from "motion/react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useClock, useFormatCountdown } from "@/components/boosters/useBoosterClock";
import { useReducedFx } from "@/components/motion/MotionPreference";
import type { ExpeditionPageView, OfferView } from "@/lib/expedition/view";
import { markExpeditionRevealedAction } from "@/server/actions/expedition";
import { Button } from "../ui/Button";
import { ExpeditionEmaki } from "./ExpeditionEmaki";
import { OfferCard } from "./OfferCard";
import { RaritySeal } from "./parts";
import { TeamSheet, type LaunchedTeam } from "./TeamSheet";
import "./expedition.css";

// Séquences lourdes, chargées seulement quand elles se jouent
const LaunchSequence = dynamic(() => import("./LaunchSequence").then((mod) => mod.LaunchSequence), { ssr: false });
const ResultReveal = dynamic(() => import("./ResultReveal").then((mod) => mod.ResultReveal), { ssr: false });

/**
 * Page des expéditions : rapport à ouvrir, expédition en route (rouleau peint) ou repos après un abandon,
 * puis les trois laissez-passer du jour et le journal. Le client n'envoie que l'offre et l'équipe choisies ;
 * tout le reste vient du serveur.
 */
export function ExpeditionScreen({ view }: { view: ExpeditionPageView }) {
  const t = useTranslations("expedition");
  const format = useFormatter();
  const formatCountdown = useFormatCountdown();
  const reduced = useReducedFx();
  const router = useRouter();
  const serverNow = Date.parse(view.serverNow);
  const now = useClock(serverNow);
  const [choosing, setChoosing] = useState<OfferView | null>(null);
  const [launching, setLaunching] = useState<LaunchedTeam | null>(null);
  const [revealing, setRevealing] = useState(false);

  const cooldownEnd = view.cooldownUntil ? Date.parse(view.cooldownUntil) : null;
  const resting = cooldownEnd !== null && cooldownEnd > now && !view.active;
  const blockedReason = !view.canLaunch ? ("PREVIEW_OFF" as const) : view.active ? ("ACTIVE" as const) : resting ? ("COOLDOWN" as const) : null;
  const resetIn = Math.max(0, Date.parse(view.nextResetAt) - now);

  // Nouveau jour ou fin du repos : le serveur redonne le plateau
  useEffect(() => {
    if (resetIn > 0) return;
    const id = setTimeout(() => router.refresh(), 1200);
    return () => clearTimeout(id);
  }, [resetIn, router]);
  const restOver = cooldownEnd !== null && cooldownEnd <= now;
  useEffect(() => {
    if (restOver) router.refresh();
  }, [restOver, router]);

  const onLaunched = useCallback(
    (team: LaunchedTeam) => {
      setChoosing(null);
      setLaunching(team);
      // Le plateau se met à jour derrière la séquence
      router.refresh();
    },
    [router],
  );

  const closeReveal = useCallback(() => {
    setRevealing(false);
    if (view.result) void markExpeditionRevealedAction({ id: view.result.id }).finally(() => router.refresh());
  }, [view.result, router]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="flex flex-col gap-8">
        {/* Rapport de retour à ouvrir */}
        {view.result && (
          <m.section
            aria-labelledby="exp-return-title"
            className="relative flex items-center gap-4 overflow-hidden lacquer rounded-hero border-kin/50 p-4"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span aria-hidden="true" className="exp-call relative flex h-16 w-20 shrink-0 items-center justify-center rounded-sm bg-[linear-gradient(160deg,#f6eedd,#e8dcc2)] shadow-raised">
              <span lang="ja" className="inline-flex size-8 items-center justify-center rounded-full bg-shu-btn font-seal text-sm text-washi-paper">
                封
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h2 id="exp-return-title" className="font-title text-lg leading-tight font-extrabold">
                {t("result.banner")}
              </h2>
              <p className="flex items-center gap-1.5 truncate text-xs text-text-muted">
                <RaritySeal rarity={view.result.minRarity} />
                {view.result.name}
              </p>
              <Button type="button" variant="primary" className="self-start" onClick={() => setRevealing(true)}>
                {t("result.open")}
              </Button>
            </div>
          </m.section>
        )}

        {/* En route */}
        {view.active && <ExpeditionEmaki active={view.active} serverNow={serverNow} cooldownHours={view.rules.abandonCooldownHours} reduced={reduced} />}

        {/* Repos après un abandon : une bougie qui se consume */}
        {resting && cooldownEnd !== null && (
          <section className="flex items-center gap-4 lacquer rounded-card p-4" aria-live="polite">
            <span aria-hidden="true" className="relative flex h-16 w-6 shrink-0 items-end justify-center">
              <span className="exp-flicker absolute -top-1 h-4 w-2.5 rounded-full bg-kin shadow-[0_0_12px_rgb(217_181_86/0.8)]" />
              <span
                className="block h-12 w-4 origin-bottom rounded-sm bg-washi-paper/80 transition-transform duration-1000"
                style={{ transform: `scaleY(${Math.max(0.08, (cooldownEnd - now) / Math.max(1, view.rules.abandonCooldownHours * 3_600_000))})` }}
              />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-title text-lg font-extrabold">{t("rest.title")}</h2>
              <p className="text-sm tabular-nums text-text-muted">{t("rest.body", { time: formatCountdown(cooldownEnd - now) })}</p>
            </div>
          </section>
        )}

        {/* Les routes du jour */}
        <section aria-labelledby="exp-board-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="exp-board-title" className="font-heading text-xl font-extrabold">
              {t("board.title")}
            </h2>
            <span className="text-xs tabular-nums text-text-muted">{t("board.resetIn", { time: formatCountdown(resetIn) })}</span>
          </div>
          {blockedReason === "ACTIVE" && <p className="text-sm text-text-muted">{t("board.oneAtATime")}</p>}
          {view.offers.length === 0 ? (
            <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("board.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.offers.map((offer, i) => (
                <OfferCard
                  key={`${view.dayKey}-${offer.slot}`}
                  offer={offer}
                  index={i}
                  discoveryPct={view.discoveryPct}
                  blockedReason={blockedReason}
                  reduced={reduced}
                  onChoose={() => setChoosing(offer)}
                />
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted">{t("board.rules", { hours: view.rules.abandonCooldownHours, discovery: format.number(view.discoveryPct) })}</p>
        </section>

        {/* Journal */}
        {view.history.length > 0 && (
          <section aria-labelledby="exp-history-title" className="flex flex-col gap-3">
            <h2 id="exp-history-title" className="font-heading text-xl font-extrabold">
              {t("history.title")}
            </h2>
            <ul className="flex flex-col divide-y divide-border lacquer rounded-card">
              {view.history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    lang="ja"
                    className={`inline-flex size-9 shrink-0 -rotate-6 items-center justify-center rounded-[6px] border-2 font-seal text-[11px] leading-none [writing-mode:vertical-rl] ${
                      h.outcome === "TRIUMPH" ? "border-kin text-kin" : h.outcome === "SUCCESS" ? "border-shu text-shu" : "border-border text-text-muted"
                    }`}
                  >
                    {h.outcome === "TRIUMPH" ? "大成" : h.outcome === "SUCCESS" ? "成功" : h.outcome === "FAILURE" ? "失敗" : "中止"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                      <RaritySeal rarity={h.minRarity} />
                      {h.name}
                    </span>
                    <span className="text-xs tabular-nums text-text-muted">
                      {t(`history.outcome.${h.outcome}`)} · {format.dateTime(new Date(h.startedAt), { dateStyle: "medium" })}
                    </span>
                  </span>
                  {h.outcome !== "ABANDONED" && (h.zeni > 0 || h.boosters > 0) && (
                    <span className="shrink-0 text-right text-xs tabular-nums text-text-muted">
                      {t("history.gains", { zeni: format.number(h.zeni), boosters: h.boosters })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {choosing && view.canLaunch && (
        <TeamSheet
          key={choosing.typeId}
          offer={choosing}
          dayKey={view.dayKey}
          cardBonus={view.rules.cardBonus}
          suggestionCards={view.suggestionCards}
          onClose={() => setChoosing(null)}
          onLaunched={onLaunched}
        />
      )}
      {launching && <LaunchSequence cards={launching.cards} name={launching.offer.name} reduced={reduced} onDone={() => setLaunching(null)} />}
      {revealing && view.result && <ResultReveal result={view.result} reduced={reduced} onClose={closeReveal} />}
    </LazyMotion>
  );
}
