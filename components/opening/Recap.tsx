"use client";

import { useRarities, useRarityDefinitions, useRaritySeals } from "@/lib/catalog/use-rarities";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { OpenCount } from "@/lib/boosters/catalog";
import type { OpenedBoosterView, OpenedCardView } from "@/lib/boosters/view";
import { type Rarity } from "@/lib/catalog/rarity";
import type { SoundName } from "@/lib/sound/synth";
import type { BoosterState } from "@/server/boosters/state";
import { RARITY_BG } from "../boosters/format";
import { NextFreeIn } from "../boosters/NextFreeIn";
import { Fuda } from "../fuda/Fuda";
import { ZeniCoin } from "../layout/ZeniCoin";
import { CopyLinkButton } from "./CopyLinkButton";
import { CountPicker } from "./CountPicker";
import { leakFor } from "./RarityFx";
import { CardStamps, FeaturedSeal } from "./RevealCard";

type Props = {
  /** Nom du booster ouvert (titre du récap) et son kanji, en filigrane. */
  name: string;
  emblem: string;
  boosters: OpenedBoosterView[];
  state: BoosterState;
  reduced: boolean;
  play: (name: SoundName, haptic?: number | number[]) => void;
  counters: { pity: boolean; golden: boolean; featured: { left: number; threshold: number } | null };
  zeniSpent: number;
  count: OpenCount;
  maxCount: number;
  onCount: (n: OpenCount) => void;
};

/** Au-delà, un seul booster passe lui aussi en grille plutôt qu'en éventail. */
const FAN_MAX = 6;

/**
 * Récap du tirage, posé sur la nuit de la page : le nom du booster, le décompte, puis les cartes
 * triées par rareté. Un booster s'étale en éventail autour de sa meilleure carte (en grille sur
 * téléphone) ; plusieurs boosters, en grille serrée. Puis les compteurs (ensō de pitié qui se
 * referme). Les actions pour enchaîner vivent dans `RecapActionBar`, toujours à portée du pouce.
 */
export function Recap({ name, emblem, boosters, state, reduced, play, counters, zeniSpent, count, maxCount, onCount }: Props) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const definitions = useRarityDefinitions();
  const t = useTranslations("opening");
  const tRarity = useTranslations("rarity");
  const wide = useWide();
  const cards = boosters.flatMap((b) => b.cards);
  const sorted = [...cards].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || Number(b.featured) - Number(a.featured));
  const best = sorted[0];
  const newCount = cards.filter((c) => c.isNew).length;
  const tally = RARITIES.slice()
    .reverse()
    .map((r) => [r, cards.filter((c) => c.rarity === r).length] as [Rarity, number])
    .filter(([, n]) => n > 0);
  const many = boosters.length > 1;
  const fan = !many && cards.length <= FAN_MAX;
  const glow = best ? leakFor(best.rarity, definitions) : undefined;
  const flags = {
    divine: boosters.some((b) => b.divine),
    golden: boosters.some((b) => b.golden),
    pity: boosters.some((b) => b.pityTriggered),
    featuredPity: boosters.some((b) => b.featuredPityTriggered),
  };

  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => play("clack"), 450);
    return () => clearTimeout(id);
  }, [play, reduced]);

  const pityProgress = 1 - (state.pityLeft - 1) / Math.max(1, state.pityThreshold);
  const appear = (delay: number) =>
    ({
      initial: reduced ? false : { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { delay: reduced ? 0 : delay, duration: 0.35 },
    }) as const;

  return (
    <section aria-labelledby="recap-title" className="relative isolate flex w-full flex-col items-center gap-6">
      {/* Halo à la couleur de la meilleure carte et kanji du booster en filigrane */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-1rem] -top-6 bottom-0 -z-10 overflow-hidden">
        {glow && (
          <m.span
            className="absolute top-24 left-1/2 aspect-[4/3] w-[min(60rem,170vw)] -translate-x-1/2 rounded-full"
            style={{ background: `radial-gradient(ellipse at center, ${glow} 0%, transparent 62%)` }}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 0.32 }}
            transition={{ duration: 0.9 }}
          />
        )}
        <span lang="ja" className="absolute top-40 right-[-0.1em] font-seal text-[min(20rem,55vw)] leading-none text-border opacity-50">
          {emblem}
        </span>
      </div>

      <m.header className="flex flex-col items-center gap-2 text-center" {...appear(0)}>
        <h2 id="recap-title" className="font-heading text-3xl font-extrabold text-balance sm:text-5xl">
          {name}
        </h2>
        {many && <p className="text-sm text-text-muted tabular-nums">{t("recapCounts", { boosters: boosters.length, cards: cards.length })}</p>}
        <p className="mt-1 rounded-pill border border-border bg-surface px-3 py-1 text-sm">
          {t("newCount", { count: newCount })} · {t("dupCount", { count: cards.length - newCount })}
        </p>
        {(flags.divine || flags.golden || flags.pity || flags.featuredPity) && (
          <p className="flex flex-wrap justify-center gap-1.5">
            {flags.divine && <Badge glyph="神" label={t("divine")} />}
            {flags.golden && <Badge glyph="金" label={t("golden")} />}
            {flags.pity && <Badge glyph="神" label={t("pityTriggered")} />}
            {flags.featuredPity && <Badge glyph="星" label={t("featuredPityTriggered")} />}
          </p>
        )}
      </m.header>

      {/* Décompte : un sceau par rareté, tamponnés l'un après l'autre */}
      <ul className="-mt-2 flex flex-wrap justify-center gap-1.5" aria-label={t("tally")}>
        {tally.map(([r, n], i) => (
          <m.li
            key={r}
            className={`flex h-8 items-center gap-1 rounded-[4px] px-2 font-seal text-base text-washi-paper ${RARITY_BG[r]}`}
            initial={reduced ? false : { opacity: 0, scale: 2, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 3 : -3 }}
            transition={{ delay: reduced ? 0 : 0.25 + i * 0.14, type: "spring", stiffness: 520, damping: 17 }}
          >
            <span aria-hidden="true">{RARITY_SEAL[r]}</span>
            <span className="font-body text-xs font-bold tabular-nums">×{n}</span>
            <span className="sr-only">{tRarity(r)}</span>
          </m.li>
        ))}
      </ul>

      {fan && wide ? (
        <FanRow cards={sorted} glow={glow} reduced={reduced} />
      ) : (
        <ul
          className={
            fan
              ? "flex w-full max-w-md flex-wrap justify-center gap-x-2.5 gap-y-5 pt-2"
              : "flex w-full max-w-5xl flex-wrap justify-center gap-x-2.5 gap-y-5 pt-2 sm:gap-x-3"
          }
        >
          {sorted.map((card, i) => (
            <m.li
              key={card.userCardId}
              // Rangées en flex (et non en grille) : la dernière, incomplète, reste centrée
              className={`relative w-[calc((100%-1.25rem)/3)] ${fan ? "" : "sm:w-[calc((100%-3rem)/5)] lg:w-[calc((100%-4.5rem)/7)]"}`}
              initial={reduced ? false : { opacity: 0, y: -24, rotate: i % 2 ? 4 : -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: reduced ? 0 : 0.3 + Math.min(i, 20) * 0.05, type: "spring", stiffness: 300, damping: 24 }}
            >
              {/* Grille figée : jusqu'à 49 cartes, sans inclinaison ni reflet animé chacune */}
              <BestFrame best={i === 0} glow={glow}>
                <Fuda card={card} series={card.series} size="sm" still />
              </BestFrame>
              <CardStamps card={card} animated={false} small />
              {card.featured && <FeaturedSeal animated={false} />}
            </m.li>
          ))}
        </ul>
      )}

      {/* Lien public de chaque sachet */}
      <m.div className="flex w-full max-w-md flex-col items-center" {...appear(0.6)}>
        {many ? (
          <details className="group w-full rounded-card border border-border bg-surface/60 text-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 font-bold [&::-webkit-details-marker]:hidden">
              {t("boostersDetail", { count: boosters.length })}
              <span aria-hidden="true" className="text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none">
                ▾
              </span>
            </summary>
            <ul className="flex flex-col divide-y divide-border border-t border-border px-4">
              {boosters.map((b, i) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-text-muted">
                    {t("boosterN", { n: i + 1 })}
                    {b.divine && <Badge glyph="神" label={t("divine")} />}
                    {b.golden && <Badge glyph="金" label={t("golden")} />}
                    {b.pityTriggered && <Badge glyph="神" label={t("pityTriggered")} />}
                    {b.featuredPityTriggered && <Badge glyph="星" label={t("featuredPityTriggered")} />}
                  </span>
                  <CopyLinkButton openingId={b.id} />
                </li>
              ))}
            </ul>
          </details>
        ) : (
          boosters[0] && <CopyLinkButton openingId={boosters[0].id} />
        )}
      </m.div>

      {/* Compteurs et suite */}
      <m.div className="flex w-full max-w-md flex-col items-center gap-4" {...appear(0.7)}>
        {(counters.pity || counters.golden || counters.featured || zeniSpent > 0) && (
          <div className="flex w-full items-center gap-4 rounded-card border border-border bg-surface/60 px-4 py-3">
            {(counters.pity || (counters.featured && counters.featured.threshold > 0)) && (
              <div className="flex shrink-0 gap-2">
                {counters.pity && (
                  <ProgressEnso progress={pityProgress} glyph="神" tone="border-shu" label={t("pityLine", { count: state.pityLeft })} />
                )}
                {counters.featured && counters.featured.threshold > 0 && (
                  <ProgressEnso
                    progress={1 - (counters.featured.left - 1) / counters.featured.threshold}
                    glyph="星"
                    tone="border-kin"
                    label={t("featuredLine", { count: counters.featured.left })}
                  />
                )}
              </div>
            )}
            <ul className="flex min-w-0 flex-col gap-0.5 text-sm">
              {counters.pity && <li>{t("pityLine", { count: state.pityLeft })}</li>}
              {counters.golden && state.goldenIn !== null && <li className="text-kin">{t("goldenLine", { count: state.goldenIn })}</li>}
              {counters.featured && counters.featured.threshold > 0 && (
                <li className="text-kin">{t("featuredLine", { count: counters.featured.left })}</li>
              )}
              {zeniSpent > 0 && (
                <li className="flex items-center gap-1.5 text-text-muted">
                  <ZeniCoin size={14} />
                  {t("spent", { amount: zeniSpent })}
                </li>
              )}
            </ul>
          </div>
        )}

        {maxCount > 1 && <CountPicker value={count} max={maxCount} onChange={onCount} />}
        <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />
      </m.div>
    </section>
  );
}

/**
 * Éventail d'un booster (tablette et desktop) : la meilleure carte au centre, surélevée, les autres
 * alternées à droite puis à gauche, de plus en plus inclinées. La pose de l'éventail vit sur le `li`,
 * l'entrée animée sur son enfant : les deux transformations ne s'écrasent pas.
 */
function FanRow({ cards, glow, reduced }: { cards: OpenedCardView[]; glow: string | undefined; reduced: boolean }) {
  const t = useTranslations("opening");
  const left: OpenedCardView[] = [];
  const right: OpenedCardView[] = [];
  cards.slice(1).forEach((card, i) => (i % 2 ? left : right).push(card));
  const row = [...left.reverse(), ...cards.slice(0, 1), ...right];
  const center = left.length;
  const width = `min(11.5rem, calc((100vw - 8rem) / ${row.length}))`;
  return (
    <ul className="flex w-full items-start justify-center gap-4 pt-16 pb-6 lg:gap-6">
      {row.map((card, i) => {
        const d = i - center;
        const isBest = d === 0;
        return (
          <li
            key={card.userCardId}
            className={`relative shrink-0 ${isBest ? "z-10" : ""}`}
            style={{ width, transform: isBest ? "translateY(-1.25rem) scale(1.08)" : `translateY(${d * d * 0.6 + Math.abs(d) * 0.9}rem) rotate(${d * 5}deg)` }}
          >
            <m.div
              initial={reduced ? false : { opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: reduced ? 0 : 0.25 + Math.abs(d) * 0.09, type: "spring", stiffness: 240, damping: 22 }}
            >
              {isBest && (
                <p className="absolute inset-x-0 -top-8 text-center text-xs font-bold">
                  <span className="rounded-pill border border-border bg-surface px-2.5 py-1">{t("bestPull")}</span>
                </p>
              )}
              <BestFrame best={isBest} glow={glow}>
                <Fuda card={card} series={card.series} size="md" still={!isBest} />
              </BestFrame>
              <CardStamps card={card} animated={!reduced} delay={0.6 + Math.abs(d) * 0.09} />
              {card.featured && <FeaturedSeal animated={!reduced} delay={0.65} />}
            </m.div>
          </li>
        );
      })}
    </ul>
  );
}

/** Anneau lumineux à la couleur de la meilleure rareté (ombre fixe, rien d'animé). */
function BestFrame({ best, glow, children }: { best: boolean; glow: string | undefined; children: ReactNode }) {
  if (!best || !glow) return <>{children}</>;
  return (
    <div className="rounded-fuda" style={{ boxShadow: `0 0 0 2px ${glow}, 0 0 28px ${glow}` }}>
      {children}
    </div>
  );
}

/** Éventail à partir de la tablette : en dessous, la grille de trois colonnes se lit mieux. */
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(min-width: 48rem)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 48rem)").matches,
    () => false,
  );
}

function Badge({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 text-xs font-bold text-text">
      <span aria-hidden="true" lang="ja" className="font-seal">
        {glyph}
      </span>
      {label}
    </span>
  );
}

/** Ensō de progression (deux demi-anneaux qui tournent) avec un sceau au centre. */
function ProgressEnso({ progress, glyph, tone, label }: { progress: number; glyph: string; tone: string; label: string }) {
  const p = Math.min(1, Math.max(0, progress));
  const firstHalf = Math.min(p, 0.5) * 360;
  const secondHalf = Math.max(p - 0.5, 0) * 360;
  return (
    <span role="img" aria-label={label} className="relative inline-flex size-12 items-center justify-center">
      <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-border" />
      <span aria-hidden="true" className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <m.span
          className={`absolute inset-0 rounded-full border-4 [clip-path:inset(0_50%_0_0)] ${tone}`}
          initial={{ rotate: 0 }}
          animate={{ rotate: firstHalf }}
          transition={{ delay: 1, duration: 0.6 }}
        />
      </span>
      <span aria-hidden="true" className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
        <m.span
          className={`absolute inset-0 rounded-full border-4 [clip-path:inset(0_0_0_50%)] ${tone}`}
          initial={{ rotate: 0 }}
          animate={{ rotate: secondHalf }}
          transition={{ delay: 1.6, duration: 0.6 }}
        />
      </span>
      <span aria-hidden="true" lang="ja" className="relative font-seal text-xl">
        {glyph}
      </span>
    </span>
  );
}
