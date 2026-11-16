"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useClock, useFormatCountdown } from "@/components/boosters/useBoosterClock";
import { Fuda } from "@/components/fuda/Fuda";
import { EXPEDITION_OUTCOMES } from "@/lib/expedition/types";
import type { ActiveExpeditionView } from "@/lib/expedition/view";
import { abandonExpeditionAction } from "@/server/actions/expedition";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { RaritySeal, RewardChips, RiskLanterns, useDuration, useTierStyle } from "./parts";

/** Relais (宿場) le long de la route, en part du trajet. */
const STATIONS = [0, 1 / 3, 2 / 3, 1];
/** Lignes du carnet de route : départ, puis tous les quarts du trajet. */
const LOG_STEPS = [
  { at: 0, key: "0" },
  { at: 0.25, key: "1" },
  { at: 0.5, key: "2" },
  { at: 0.75, key: "3" },
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Montagnes en silhouette, deux fois côte à côte pour boucler sans couture. */
function Ridge({ d, className }: { d: string; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none" className={`h-full w-1/2 shrink-0 ${className}`}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const FAR = "M0 100V62l30-18 26 12 40-30 34 22 28-14 46 26 30-20 40 18 36-24 40 26 50-14v94Z";
const NEAR = "M0 100V78l40-12 30 10 46-22 40 20 36-8 50 16 44-18 34 14 40-10 40 12v20Z";

/**
 * Expédition en route : un emakimono (rouleau peint) où la lanterne du groupe avance vers le dernier relais,
 * montagnes et brume en parallaxe lente, ciel qui passe de l'aube au crépuscule. Dessous : compte à rebours,
 * équipe partie, rappel des chances et des gains, carnet de route et abandon.
 */
export function ExpeditionEmaki({ active, serverNow, cooldownHours, reduced }: { active: ActiveExpeditionView; serverNow: number; cooldownHours: number; reduced: boolean }) {
  const t = useTranslations("expedition.active");
  const tOutcome = useTranslations("expedition.outcome");
  const tTeam = useTranslations("expedition.team");
  const tRarity = useTranslations("rarity");
  const tErrors = useTranslations("expedition.errors");
  const formatCountdown = useFormatCountdown({ days: false });
  const duration = useDuration();
  const tier = useTierStyle(active.minRarity);
  const router = useRouter();
  const now = useClock(serverNow);
  const start = Date.parse(active.startedAt);
  const end = Date.parse(active.endsAt);
  const remaining = Math.max(0, end - now);
  const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const arrived = remaining === 0;
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Arrivée : le serveur clôt l'expédition au prochain rendu (gains, cartes rendues, rapport)
  useEffect(() => {
    if (!arrived) return;
    const id = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(id);
  }, [arrived, router]);

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const p = { triumph: active.triumphPct, success: active.successPct - active.triumphPct, failure: 100 - active.successPct };

  const abandon = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await abandonExpeditionAction({ id: active.id });
        if (res.ok) {
          setAbandoning(false);
          router.refresh();
        } else setError(tErrors(res.error));
      } catch {
        setError(tErrors("unexpected"));
      }
    });

  return (
    <section aria-labelledby="exp-active-title" className="flex flex-col gap-4">
      {/* Rouleau peint */}
      <div className={`relative h-56 overflow-hidden rounded-hero border border-border shadow-raised ${tier.className}`} style={tier.style}>
        {/* Ciel : aube → crépuscule, en fondu */}
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,#2a3550_0%,#d98b6a_70%,#f3c98b_100%)]" />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,#141428_0%,#5b3a6b_65%,#c8372d_100%)] transition-opacity duration-1000"
          style={{ opacity: progress }}
        />
        {/* Soleil qui descend */}
        <span
          aria-hidden="true"
          className="absolute top-6 right-10 size-14 rounded-full bg-shu/90 shadow-[0_0_40px_rgb(224_83_63/0.6)] transition-transform duration-1000"
          style={{ transform: `translateY(${progress * 70}px)` }}
        />
        {/* Motif du palier, très léger */}
        <span aria-hidden="true" className="absolute inset-0 opacity-[.07]" style={{ background: "var(--wagara)" }} />
        {/* Montagnes lointaines et proches, en parallaxe */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-10 h-24 overflow-hidden text-[#1b1d2c]/70">
          <div className="exp-drift flex h-full" style={{ ["--exp-drift" as string]: "120s" }}>
            <Ridge d={FAR} className="" />
            <Ridge d={FAR} className="" />
          </div>
        </div>
        {/* Brume suyari-gasumi */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-16 h-6 overflow-hidden opacity-60">
          <div className="exp-drift flex h-full gap-24" style={{ ["--exp-drift" as string]: "45s" }}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="h-3 w-40 shrink-0 self-center rounded-full bg-washi-paper/50" />
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 overflow-hidden text-[#0f1019]">
          <div className="exp-drift flex h-full" style={{ ["--exp-drift" as string]: "70s" }}>
            <Ridge d={NEAR} className="" />
            <Ridge d={NEAR} className="" />
          </div>
        </div>

        {/* Route, relais et lanterne du groupe */}
        <div className="absolute inset-x-6 bottom-6 h-8">
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-washi-paper/40" />
          <span aria-hidden="true" className="absolute top-1/2 left-0 w-full origin-left border-t-2 border-kin transition-transform duration-1000" style={{ transform: `scaleX(${progress})` }} />
          {STATIONS.map((s, i) => (
            <span
              key={i}
              aria-hidden="true"
              lang="ja"
              className={`absolute top-1/2 inline-flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] border font-seal text-[10px] ${
                progress >= s ? "border-kin bg-kin text-sumi" : "border-washi-paper/50 bg-sumi/70 text-washi-paper/70"
              }`}
              style={{ left: `${s * 100}%` }}
            >
              宿
            </span>
          ))}
          <div aria-hidden="true" className="absolute inset-0 transition-transform duration-1000 ease-linear" style={{ transform: `translateX(${progress * 100}%)` }}>
            <span className="absolute bottom-3 left-0 flex -translate-x-1/2 flex-col items-center">
              <span className="exp-breathe absolute -top-3 size-12 rounded-full bg-kin/40 blur-md" />
              <span className={arrived ? "" : "exp-walk"}>
                <svg viewBox="0 0 20 28" width="20" height="28" className="exp-flicker relative text-kin drop-shadow-[0_0_6px_rgb(217_181_86/0.8)]">
                  <path d="M7 2h6M10 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <rect x="3" y="4" width="14" height="18" rx="7" fill="currentColor" />
                  <path d="M3.5 10h13M3.5 16h13" stroke="#5b3a1a" strokeWidth="1" opacity="0.5" />
                  <path d="M7 24h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          </div>
        </div>

        {/* Titre posé sur le rouleau */}
        <div className="absolute top-3 left-4 flex max-w-[70%] flex-col gap-1 text-washi-paper">
          <span className="inline-flex items-center gap-2">
            <RaritySeal rarity={active.minRarity} className="text-xl drop-shadow" />
            <RiskLanterns risk={active.risk} />
          </span>
          <h2 id="exp-active-title" className="font-title text-xl leading-tight font-extrabold drop-shadow">
            {active.name}
          </h2>
        </div>
      </div>

      {/* Compte à rebours */}
      <div className="flex flex-col items-center gap-2 text-center">
        <AnimatePresence mode="wait" initial={false}>
          {arrived ? (
            <m.p key="arrived" className="font-title text-2xl font-extrabold text-kin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {t("arriving")}
            </m.p>
          ) : (
            <m.div key="countdown" className="flex flex-col items-center gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
              <span className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("endsIn")}</span>
              <span role="timer" aria-label={formatCountdown(remaining)} className="font-heading text-5xl leading-none tabular-nums">
                {pad(hours)}
                <span className="text-text-muted">:</span>
                {pad(minutes)}
                <span className="text-text-muted">:</span>
                {pad(seconds)}
              </span>
            </m.div>
          )}
        </AnimatePresence>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-pill bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t("progress")}>
          <span className="block h-full w-full origin-left rounded-pill bg-shu transition-transform duration-1000 ease-linear" style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p className="text-xs tabular-nums text-text-muted">
          {t("elapsed", { time: formatCountdown(Math.max(0, now - start)), total: duration(Math.round((end - start) / 60_000)) })}
        </p>
      </div>

      {/* Équipe partie */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">{t("team")}</h3>
        <ul className="grid max-w-[22rem] grid-cols-3 gap-2.5">
          {active.team.map((card) => (
            <li key={card.cardId} className="relative">
              <Fuda card={card} series={card.series} size="sm" still />
              <span aria-hidden="true" lang="ja" className="absolute top-1 left-1 inline-flex size-6 items-center justify-center rounded-[5px] bg-shu-btn font-seal text-xs text-washi-paper shadow-raised">
                遠
              </span>
              {card.bonus > 0 && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular-nums shadow-raised">
                  {tTeam("bonus", { value: card.bonus })}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">{t("locked")}</p>
      </div>

      {/* Rappel : condition, chances et gains possibles */}
      <div className="flex flex-col gap-3 lacquer rounded-card p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <RaritySeal rarity={active.minRarity} className="text-base" />
          {t("requirement", { rarity: tRarity(active.minRarity as "COMMON") })}
        </p>
        <h3 className="text-sm font-bold">{t("gains")}</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {[...EXPEDITION_OUTCOMES].reverse().map((o) => {
            const chance = o === "TRIUMPH" ? p.triumph : o === "SUCCESS" ? p.success : p.failure;
            if (chance <= 0) return null;
            return (
              <li key={o} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={`font-bold ${o === "TRIUMPH" ? "text-kin" : o === "FAILURE" ? "text-text-muted" : "text-shu"}`}>{tOutcome(o)}</span>
                  <span className="text-xs tabular-nums text-text-muted">{t("probability", { value: Math.round(chance * 10) / 10 })}</span>
                </span>
                <RewardChips reward={active.rewards[o]} boosterName={active.boosterName} extraLot={active.extraLot} />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Carnet de route */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">{t("journal")}</h3>
        <ol className="flex flex-col gap-1.5 border-l-2 border-border pl-3 text-sm">
          <AnimatePresence initial={false}>
            {LOG_STEPS.filter((s) => progress >= s.at).map((s) => (
              <m.li key={s.key} className="text-text-muted" initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
                {t(`log.${active.risk}.${s.key}`)}
              </m.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>

      {!arrived && (
        <Button type="button" variant="ghost" className="self-center" onClick={() => setAbandoning(true)}>
          {t("abandon")}
        </Button>
      )}

      <Sheet open={abandoning} onClose={() => setAbandoning(false)} title={t("abandonTitle")}>
        <p className="text-sm">{cooldownHours > 0 ? t("abandonBody", { hours: cooldownHours }) : t("abandonBodyFree")}</p>
        {error && (
          <p role="alert" className="text-sm text-shu">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => setAbandoning(false)}>
            {t("keepGoing")}
          </Button>
          <Button type="button" variant="danger" disabled={pending} onClick={abandon}>
            {pending ? t("abandoning") : t("abandonConfirm")}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
