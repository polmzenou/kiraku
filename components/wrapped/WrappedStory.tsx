"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import type { CardView } from "@/lib/boosters/view";
import { withShareCode } from "@/lib/referral/share";
import { winRate, type WrappedSummary } from "@/lib/wrapped/summary";
import { useShareCode } from "../referral/ShareCode";
import { Button } from "../ui/Button";
import "./wrapped.css";

// Wrapped en diaporama : un chiffre par écran, barres de progression, toucher à droite ou à gauche,
// flèches du clavier. Sans JavaScript (avant l'hydratation), les écrans s'empilent et se lisent tous.
// L'image de fin est générée par le serveur (/wrapped/image) ; on la partage avec le bouton natif du
// téléphone, sinon on la télécharge.

const ROMAN = ["", "I", "II", "III"] as const;
const noop = () => () => {};

type Slide = { key: string; body: ReactNode };

export type WrappedStoryProps = {
  summary: WrappedSummary;
  /** Fuda du plus gros tirage et de la carte préférée (absentes : carte sortie du catalogue). */
  cards: { bestPull: CardView | null; favorite: CardView | null };
  /** Adresse de l'image story (avec ?u=… dans l'aperçu de l'admin). */
  imageSrc: string;
  /** Lien de Kiraku à copier. */
  siteUrl: string;
  /** Aperçu de l'admin : cadre de téléphone au lieu du plein écran, pas de bouton Quitter. */
  embedded?: boolean;
};

export function WrappedStory({ summary, cards, imageSrc, siteUrl, embedded = false }: WrappedStoryProps) {
  const t = useTranslations("wrapped.story");
  const tReason = useTranslations("economy.ledger.reasons");
  const tTier = useTranslations("ranked.tiers");
  const format = useFormatter();
  // Faux au rendu serveur et pendant l'hydratation, vrai ensuite : sans JavaScript, tout reste lisible
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [index, setIndex] = useState(0);

  const kicker = (text: string) => <p className="text-xs font-bold uppercase tracking-[0.25em] text-kin">{text}</p>;
  const big = (text: string) => <p className="font-heading text-4xl leading-tight text-balance sm:text-5xl">{text}</p>;
  const body = (text: string) => <p className="max-w-sm text-base text-text-muted text-pretty">{text}</p>;
  const card = (view: CardView | null) => (view ? <div className="w-40 sm:w-48"><Fuda card={view} series={view.series} size="md" tilt={false} /></div> : null);

  const pulled = Object.values(summary.pulledByRarity).reduce((s, n) => s + n, 0);
  const rate = winRate(summary.battles);
  const slides: Slide[] = [
    { key: "intro", body: <>{kicker(t("intro.kicker"))}{big(t("intro.title", { year: summary.year }))}{body(t("intro.body"))}</> },
    {
      key: "boosters",
      body: (
        <>
          {kicker(t("boosters.kicker"))}
          {big(t("boosters.value", { count: summary.boosters.opened }))}
          {(summary.boosters.golden > 0 || summary.boosters.divine > 0) && body(t("boosters.special", { golden: summary.boosters.golden, divine: summary.boosters.divine }))}
          {body(t("boosters.cards", { count: pulled, discoveries: summary.discoveries }))}
        </>
      ),
    },
    ...(summary.bestPull
      ? [{
          key: "bestPull",
          body: (
            <>
              {kicker(t("bestPull.kicker"))}
              {card(cards.bestPull)}
              {big(summary.bestPull.name)}
              {body(t("bestPull.body", { date: format.dateTime(new Date(summary.bestPull.at), { day: "numeric", month: "long" }) }))}
            </>
          ),
        }]
      : []),
    {
      key: "zeni",
      body: (
        <>
          {kicker(t("zeni.kicker"))}
          {big(t("zeni.value", { amount: summary.zeni.earned }))}
          {summary.zeni.topSource && body(t("zeni.source", { source: tReason(summary.zeni.topSource as "DAILY") }))}
          {summary.zeni.spent > 0 && body(t("zeni.spent", { amount: summary.zeni.spent }))}
        </>
      ),
    },
    {
      key: "battles",
      body: (
        <>
          {kicker(t("battles.kicker"))}
          {summary.battles.played === 0 ? (
            big(t("battles.none"))
          ) : (
            <>
              {big(t("battles.value", { count: summary.battles.won }))}
              {rate !== null && body(t("battles.rate", { played: summary.battles.played, rate }))}
              {summary.ranked &&
                body(t("battles.ranked", { rank: `${tTier(summary.ranked.tier)}${summary.ranked.division ? ` ${ROMAN[summary.ranked.division]}` : ""}`, pc: summary.ranked.bestPc }))}
            </>
          )}
        </>
      ),
    },
    ...(summary.favorite
      ? [{
          key: "favorite",
          body: (
            <>
              {kicker(t("favorite.kicker"))}
              {card(cards.favorite)}
              {big(summary.favorite.name)}
              {body(summary.favorite.source === "battle" ? t("favorite.battle", { count: summary.favorite.battles }) : t(`favorite.${summary.favorite.source}`))}
            </>
          ),
        }]
      : []),
    { key: "outro", body: <Outro year={summary.year} imageSrc={imageSrc} siteUrl={siteUrl} onReplay={() => setIndex(0)} /> },
  ];
  const last = slides.length - 1;
  const go = useCallback((step: number) => setIndex((i) => Math.min(last, Math.max(0, i + step))), [last]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, go]);

  const frame = embedded
    ? "relative flex h-[667px] w-[375px] max-w-full flex-col overflow-hidden rounded-[2rem] border-4 border-surface-2 bg-bg shadow-raised"
    : "fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg";
  const backdrop = "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgb(217_181_86/0.18),transparent_45%),radial-gradient(circle_at_10%_95%,rgb(200_55_45/0.25),transparent_45%)]";

  // Avant l'hydratation : tous les écrans à la suite, lisibles sans JavaScript
  if (!ready) {
    return (
      <section aria-label={t("label", { year: summary.year })} className="relative flex flex-col gap-10 py-6">
        {slides.map((s) => (
          <div key={s.key} className="flex flex-col items-center gap-4 text-center">{s.body}</div>
        ))}
      </section>
    );
  }

  return (
    <section aria-label={t("label", { year: summary.year })} aria-roledescription="carousel" className={frame}>
      <div aria-hidden="true" className={backdrop} />
      <div className="relative z-10 flex gap-1 px-4 pt-4">
        {slides.map((s, i) => (
          <span key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-text-muted/30">
            <span className={`block h-full origin-left bg-kin ${i < index ? "" : i === index ? "motion-safe:animate-[wrapped-fill_600ms_ease-out_both]" : "scale-x-0"}`} />
          </span>
        ))}
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 pt-2 text-xs text-text-muted">
        <span aria-live="polite">{t("progress", { n: index + 1, total: slides.length })}</span>
        {!embedded && (
          <Link href="/" className="inline-flex min-h-11 items-center px-2 font-bold text-text-muted hover:text-text">
            {t("close")}
          </Link>
        )}
      </div>

      {/* Zones de toucher : gauche = précédent, le reste = suivant (sauf sur l'écran de fin et ses boutons) */}
      <div className="relative z-0 flex min-h-0 flex-1">
        {index < last && (
          <>
            <button type="button" aria-label={t("previous")} onClick={() => go(-1)} className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize" tabIndex={-1} />
            <button type="button" aria-label={t("next")} onClick={() => go(1)} className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-e-resize" tabIndex={-1} />
          </>
        )}
        <div key={slides[index].key} className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-6 text-center motion-safe:animate-[wrapped-rise_520ms_ease-out_both]">
          {slides[index].body}
        </div>
      </div>

      <div className="relative z-20 flex items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>{t("previous")}</Button>
        {index < last && <Button variant="primary" onClick={() => go(1)}>{t("next")}</Button>}
      </div>
    </section>
  );
}

/** Écran de fin : l'image story, le partage natif ou le téléchargement, le lien de Kiraku. */
function Outro({ year, imageSrc, siteUrl, onReplay }: { year: number; imageSrc: string; siteUrl: string; onReplay: () => void }) {
  const t = useTranslations("wrapped.story.outro");
  // Lien du site avec le code de parrain du joueur
  const link = withShareCode(siteUrl, useShareCode());
  const [state, setState] = useState<"idle" | "sharing" | "failed" | "copied">("idle");
  const filename = `kiraku-wrapped-${year}.png`;

  const share = async () => {
    setState("sharing");
    try {
      const res = await fetch(imageSrc);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], filename, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t("imageAlt", { year }) });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setState("idle");
    } catch (e) {
      // Partage annulé par le joueur : pas une erreur
      setState(e instanceof DOMException && e.name === "AbortError" ? "idle" : "failed");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-kin">{t("kicker")}</p>
      <p className="font-heading text-4xl">{t("title")}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- image générée à la volée, privée, déjà au bon format */}
      <img src={imageSrc} alt={t("imageAlt", { year })} width={1080} height={1920} className="h-auto max-h-[42vh] w-auto rounded-card shadow-raised" />
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button variant="primary" onClick={share} disabled={state === "sharing"}>{state === "sharing" ? t("sharing") : t("share")}</Button>
        <a href={imageSrc} download={filename} className="inline-flex min-h-11 items-center justify-center text-sm text-link underline underline-offset-4">{t("download")}</a>
        <Button variant="ghost" onClick={copy}>{state === "copied" ? t("copied") : t("copy")}</Button>
        <Button variant="ghost" onClick={onReplay}>{t("replay")}</Button>
      </div>
      {state === "failed" && <p role="alert" className="text-sm text-shu">{t("failed")}</p>}
    </>
  );
}
