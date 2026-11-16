"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { CardPickGrid } from "@/components/collection/CardPickGrid";
import { useReducedFx } from "@/components/motion/MotionPreference";
import type { CardView } from "@/lib/boosters/view";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { teamChances } from "@/lib/expedition/chance";
import { EXPEDITION_OUTCOMES, EXPEDITION_TEAM_SIZE, type CardBonus } from "@/lib/expedition/types";
import type { OfferView } from "@/lib/expedition/view";
import { playSound } from "@/lib/sound/synth";
import { launchExpeditionAction } from "@/server/actions/expedition";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { HoldToLaunch } from "./HoldToLaunch";
import { RaritySeal, RewardChips, useDuration } from "./parts";
import { SuccessGauge } from "./SuccessGauge";

export type LaunchedTeam = { cards: CardView[]; offer: OfferView; endsAt: string };

/**
 * Préparer l'équipe d'une offre : trois emplacements, jauge des chances en direct, équipes proposées,
 * grille de la collection (raretés filtrables). Le serveur recalcule tout au départ.
 */
export function TeamSheet({
  offer,
  dayKey,
  cardBonus,
  suggestionCards,
  onClose,
  onLaunched,
}: {
  offer: OfferView;
  dayKey: string;
  cardBonus: CardBonus;
  suggestionCards: Record<string, CardView>;
  onClose: () => void;
  onLaunched: (team: LaunchedTeam) => void;
}) {
  const t = useTranslations("expedition.team");
  const tOffer = useTranslations("expedition.offer");
  const tOutcome = useTranslations("expedition.outcome");
  const tRarity = useTranslations("rarity");
  const tErrors = useTranslations("expedition.errors");
  const duration = useDuration();
  const definitions = useRarityDefinitions();
  const reduced = useReducedFx();
  const router = useRouter();
  const [team, setTeam] = useState<CardView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);

  const chances = useMemo(
    () => teamChances(team.map((c) => ({ cardId: c.cardId, rarity: c.rarity })), offer, cardBonus, definitions),
    [team, offer, cardBonus, definitions],
  );
  const bonusOf = new Map(chances.breakdown.map((b) => [b.cardId, b.bonus]));
  const selected = useMemo(() => new Set(team.map((c) => c.cardId)), [team]);
  const full = team.length === EXPEDITION_TEAM_SIZE;
  const ready = full && chances.qualifies;

  const toggle = (card: CardView) => {
    setError(null);
    setTeam((current) => {
      if (current.some((c) => c.cardId === card.cardId)) return current.filter((c) => c.cardId !== card.cardId);
      if (current.length >= EXPEDITION_TEAM_SIZE) return current;
      if (!reduced) playSound("flip", 0.4);
      return [...current, card];
    });
  };

  const suggest = (ids: string[] | null) => {
    if (!ids) return;
    const cards = ids.flatMap((id) => suggestionCards[id] ?? []);
    if (cards.length === EXPEDITION_TEAM_SIZE) {
      setError(null);
      setTeam(cards);
    }
  };

  const launch = useCallback(
    () =>
      startTransition(async () => {
        setError(null);
        try {
          const res = await launchExpeditionAction({ dayKey, slot: offer.slot, typeId: offer.typeId, cardIds: team.map((c) => c.cardId) });
          if (res.ok) {
            onLaunched({ cards: team, offer, endsAt: res.endsAt });
            return;
          }
          if (res.error === "STALE" || res.error === "DONE" || res.error === "ACTIVE") router.refresh();
          setError(tErrors(res.error));
        } catch {
          setError(tErrors("unexpected"));
        }
      }),
    [dayKey, offer, team, onLaunched, router, tErrors],
  );

  const requirement = (
    <span className="inline-flex items-center gap-1.5">
      <RaritySeal rarity={offer.minRarity} className="text-base" />
      {tOffer("requirement", { rarity: tRarity(offer.minRarity as "COMMON") })}
    </span>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t("title", { name: offer.name })} wide>
      <div className="flex flex-col gap-5">
        {/* Emplacements et jauge */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <ol className="grid w-full max-w-[22rem] grid-cols-3 gap-2.5" aria-label={t("slots")}>
            {Array.from({ length: EXPEDITION_TEAM_SIZE }, (_, i) => {
              const card = team[i];
              return (
                <li key={i} className="relative">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {card ? (
                      <m.button
                        key={card.cardId}
                        type="button"
                        onClick={() => toggle(card)}
                        aria-label={t("remove", { name: card.name })}
                        className="relative block w-full rounded-fuda"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.85, rotate: -4 }}
                        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.85 }}
                        transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 260, damping: 22 }}
                      >
                        <Fuda card={card} series={card.series} size="sm" still />
                        <span
                          className={`absolute -top-2 left-1/2 -translate-x-1/2 rounded-pill px-2 py-0.5 text-[11px] font-bold tabular-nums shadow-raised ${
                            (bonusOf.get(card.cardId) ?? 0) > 0 ? "bg-shu-btn text-washi-paper" : "bg-surface-2 text-text-muted"
                          }`}
                        >
                          {t("bonus", { value: bonusOf.get(card.cardId) ?? 0 })}
                        </span>
                      </m.button>
                    ) : (
                      <m.span
                        key={`empty-${i}`}
                        className="flex aspect-[5/7] w-full flex-col items-center justify-center gap-1 rounded-fuda border-2 border-dashed border-border text-text-muted"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {i === 0 && !chances.qualifies ? <RaritySeal rarity={offer.minRarity} className="text-3xl opacity-60" /> : <span aria-hidden="true" className="text-2xl">＋</span>}
                        <span className="px-1 text-center text-[10px] leading-tight">{t("empty")}</span>
                      </m.span>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
          <SuccessGauge success={chances.success} triumph={chances.triumph} reduced={reduced} />
        </div>

        {/* Condition : tamponnée dès qu'elle est remplie */}
        <p className={`flex items-center justify-between gap-2 rounded-control border px-3 py-2 text-sm ${chances.qualifies ? "border-hisui/60 text-text" : "border-border text-text-muted"}`}>
          {requirement}
          <AnimatePresence initial={false}>
            {chances.qualifies && (
              <m.span
                key="ok"
                aria-hidden="true"
                lang="ja"
                className="inline-flex size-8 items-center justify-center rounded-[6px] border-2 border-shu font-seal text-sm text-shu"
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.8, rotate: -12 }}
                animate={{ opacity: 1, scale: 1, rotate: -6 }}
                exit={{ opacity: 0 }}
                transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 500, damping: 18 }}
              >
                可
              </m.span>
            )}
          </AnimatePresence>
          <span className="sr-only" aria-live="polite">
            {chances.qualifies ? t("requirementMet") : ""}
          </span>
        </p>

        {/* Gains selon l'issue */}
        <ul className="flex flex-col gap-2 text-sm">
          {[...EXPEDITION_OUTCOMES].reverse().map((o) => {
            const p = o === "TRIUMPH" ? chances.triumph : o === "SUCCESS" ? chances.success - chances.triumph : 100 - chances.success;
            if (o !== "SUCCESS" && p <= 0) return null;
            return (
              <li key={o} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={`font-bold ${o === "TRIUMPH" ? "text-kin" : o === "FAILURE" ? "text-text-muted" : "text-shu"}`}>{tOutcome(o)}</span>
                  <span className="text-xs tabular-nums text-text-muted">{t("probability", { value: p })}</span>
                </span>
                <RewardChips reward={offer.rewards[o]} boosterName={offer.boosterName} extraLot={offer.extraLot} />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-muted">
          {t("meta", { duration: duration(offer.durationMinutes), base: offer.baseSuccessPct, max: offer.maxSuccessPct })}
        </p>

        {/* Équipes en un geste */}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => suggest(offer.suggestions.best)} disabled={!offer.suggestions.best}>
            {t("best")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => suggest(offer.suggestions.thrifty)} disabled={!offer.suggestions.thrifty}>
            {t("thrifty")}
          </Button>
        </div>

        <CardPickGrid
          selected={selected}
          onPick={(card) => toggle(card)}
          pickLabel={(name) => t("pick", { name })}
          unavailable={(card) => card.free === 0 || (full && !selected.has(card.cardId))}
        />

        <p className="text-xs text-text-muted">{t("lockNotice")}</p>

        {/* Départ : barre collée en bas de la feuille */}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-bg/95 px-4 pt-3 pb-1 backdrop-blur md:-mx-6 md:px-6">
          {error && (
            <p role="alert" className="text-sm font-bold text-shu">
              {error}
            </p>
          )}
          {!error && !ready && (
            <p className="text-xs text-text-muted" aria-live="polite">
              {!full ? t("pickMore", { count: EXPEDITION_TEAM_SIZE - team.length }) : t("needRequirement", { rarity: tRarity(offer.minRarity as "COMMON") })}
            </p>
          )}
          <HoldToLaunch
            label={t("hold", { duration: duration(offer.durationMinutes) })}
            disabled={!ready}
            pending={pending}
            reduced={reduced}
            onLaunch={() => {
              if (!reduced) playSound("taiko", 0.5);
              launch();
            }}
          />
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 text-sm text-text-muted underline underline-offset-4">
            {t("later")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
