"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { OpenCount } from "@/lib/boosters/catalog";
import type { OpenedBoosterView, OpenedCardView } from "@/lib/boosters/view";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import type { SoundName } from "@/lib/sound/synth";
import type { BoosterState } from "@/server/boosters/state";
import { RARITY_BG } from "../boosters/format";
import { NextFreeIn } from "../boosters/NextFreeIn";
import { Fuda } from "../fuda/Fuda";
import { ZeniCoin } from "../layout/ZeniCoin";
import { CopyLinkButton } from "./CopyLinkButton";
import { CountPicker } from "./CountPicker";
import { FeaturedSeal, NewStamp } from "./RevealCard";

const byRarityDesc = (a: OpenedCardView, b: OpenedCardView) =>
  RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || Number(b.featured) - Number(a.featured);

type Props = {
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

/**
 * Récap « makimono » : un rouleau de papier se déroule, la meilleure carte en grand, les autres
 * tombent en place triées par rareté, le décompte se tamponne sceau par sceau ; puis les compteurs
 * (ensō de pitié qui se referme). Les actions pour enchaîner vivent dans `RecapActionBar`, toujours
 * à portée du pouce.
 */
export function Recap({ boosters, state, reduced, play, counters, zeniSpent, count, maxCount, onCount }: Props) {
  const t = useTranslations("opening");
  const tRarity = useTranslations("rarity");
  const cards = boosters.flatMap((b) => b.cards);
  const sorted = [...cards].sort(byRarityDesc);
  const best = sorted[0];
  const rest = sorted.slice(1);
  const newCount = cards.filter((c) => c.isNew).length;
  const tally = RARITIES.slice()
    .reverse()
    .map((r) => [r, cards.filter((c) => c.rarity === r).length] as [Rarity, number])
    .filter(([, n]) => n > 0);
  const many = boosters.length > 1;
  const unroll = reduced ? 0 : 0.7;

  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => play("clack"), 650);
    return () => clearTimeout(id);
  }, [play, reduced]);

  const pityProgress = 1 - (state.pityLeft - 1) / Math.max(1, state.pityThreshold);

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Le rouleau : deux baguettes qui s'écartent, le papier qui se déroule depuis le centre */}
      <div className="relative mx-auto w-full max-w-3xl">
        {/* Chaque baguette vit dans un calque de la largeur du rouleau : 50 % de ce calque = le centre */}
        {(["left", "right"] as const).map((side) => (
          <m.span
            key={side}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10"
            initial={reduced ? false : { x: side === "left" ? "50%" : "-50%" }}
            animate={{ x: 0 }}
            transition={{ duration: unroll, ease: [0.3, 0.7, 0.2, 1] }}
          >
            <span
              className={`absolute inset-y-0 w-3 rounded-full bg-[linear-gradient(90deg,#3a2414,#8a5e3a_45%,#3a2414)] ${
                side === "left" ? "left-0" : "right-0"
              }`}
            />
          </m.span>
        ))}
        <m.section
          aria-labelledby="recap-title"
          className="tanzaku mx-1.5 flex origin-center flex-col items-center gap-5 rounded-sm px-4 py-6 text-sumi shadow-[0_8px_24px_rgb(0_0_0/0.45)] sm:px-8"
          initial={reduced ? false : { scaleX: 0.02, opacity: 0.6 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: unroll, ease: [0.3, 0.7, 0.2, 1] }}
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 id="recap-title" className="font-title text-2xl font-extrabold sm:text-3xl">
              {t("recapTitle")}
            </h2>
            <span aria-hidden="true" className="h-[3px] w-16 -skew-x-12 rounded-full bg-shu-btn" />
            <p className="mt-1 text-sm text-sumi-muted">
              {t("newCount", { count: newCount })} · {t("dupCount", { count: cards.length - newCount })}
            </p>
          </div>

          {/* Décompte : un sceau par rareté, tamponnés l'un après l'autre */}
          <ul className="flex flex-wrap justify-center gap-2" aria-label={t("tally")}>
            {tally.map(([r, n], i) => (
              <m.li
                key={r}
                className={`flex h-9 items-center gap-1 rounded-[4px] px-2.5 font-seal text-lg text-washi-paper ${RARITY_BG[r]}`}
                initial={reduced ? false : { opacity: 0, scale: 2, rotate: -14 }}
                animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 3 : -3 }}
                transition={{ delay: unroll + 0.15 + i * 0.16, type: "spring", stiffness: 520, damping: 17 }}
              >
                <span aria-hidden="true">{RARITY_SEAL[r]}</span>
                <span className="font-body text-sm font-bold tabular-nums">×{n}</span>
                <span className="sr-only">{tRarity(r)}</span>
              </m.li>
            ))}
          </ul>

          {best && (
            <m.div
              className="relative w-[min(15rem,64vw)]"
              initial={reduced ? false : { opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: unroll + 0.1, type: "spring", stiffness: 220, damping: 22 }}
            >
              <p className="mb-2 text-center text-xs font-bold tracking-wide text-sumi-muted">{t("bestPull")}</p>
              <Fuda card={best} series={best.series} size="lg" />
              {best.isNew && <NewStamp animated={!reduced} delay={unroll + 0.5} />}
              {best.featured && <FeaturedSeal animated={!reduced} delay={unroll + 0.55} />}
            </m.div>
          )}

          {rest.length > 0 && (
            <ul className={`grid w-full gap-2 sm:gap-3 ${rest.length > 8 ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4"}`}>
              {rest.map((card, i) => (
                <m.li
                  key={card.userCardId}
                  className="relative"
                  initial={reduced ? false : { opacity: 0, y: -28, rotate: i % 2 ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: unroll + 0.35 + Math.min(i, 20) * 0.05, type: "spring", stiffness: 300, damping: 24 }}
                >
                  <Fuda card={card} series={card.series} size="sm" />
                  {card.isNew && <NewStamp animated={false} />}
                  {card.featured && <FeaturedSeal animated={false} />}
                </m.li>
              ))}
            </ul>
          )}

          <ul className="flex w-full flex-col divide-y divide-sumi/10 border-t border-sumi/15 text-sm">
            {boosters.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sumi-muted">
                  {many ? t("boosterN", { n: i + 1 }) : t("thisBooster")}
                  {b.divine && <Badge glyph="神" label={t("divine")} />}
                  {b.golden && <Badge glyph="金" label={t("golden")} />}
                  {b.pityTriggered && <Badge glyph="神" label={t("pityTriggered")} />}
                  {b.featuredPityTriggered && <Badge glyph="星" label={t("featuredPityTriggered")} />}
                </span>
                <CopyLinkButton openingId={b.id} />
              </li>
            ))}
          </ul>
        </m.section>
      </div>

      {/* Compteurs et suite */}
      <m.div
        className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 lacquer rounded-card p-4"
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: unroll + 0.6 }}
      >
        <div className="flex w-full items-center justify-center gap-5">
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
        <ul className="flex flex-col items-center gap-1 text-center text-sm">
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

        {maxCount > 1 && <CountPicker value={count} max={maxCount} onChange={onCount} />}
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-bold">{t("stockLeft", { count: state.stock })}</p>
          <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />
        </div>
      </m.div>
    </div>
  );
}

function Badge({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sumi/25 px-2 text-xs font-bold text-sumi">
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
    <span role="img" aria-label={label} className="relative inline-flex size-16 items-center justify-center">
      <span aria-hidden="true" className="absolute inset-0 rounded-full border-[5px] border-border" />
      <span aria-hidden="true" className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <m.span
          className={`absolute inset-0 rounded-full border-[5px] [clip-path:inset(0_50%_0_0)] ${tone}`}
          initial={{ rotate: 0 }}
          animate={{ rotate: firstHalf }}
          transition={{ delay: 1, duration: 0.6 }}
        />
      </span>
      <span aria-hidden="true" className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
        <m.span
          className={`absolute inset-0 rounded-full border-[5px] [clip-path:inset(0_0_0_50%)] ${tone}`}
          initial={{ rotate: 0 }}
          animate={{ rotate: secondHalf }}
          transition={{ delay: 1.6, duration: 0.6 }}
        />
      </span>
      <span aria-hidden="true" lang="ja" className="relative font-seal text-2xl">
        {glyph}
      </span>
    </span>
  );
}
