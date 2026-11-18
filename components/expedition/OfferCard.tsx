"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import type { OfferView } from "@/lib/expedition/view";
import { RaritySeal, RewardChips, RiskLanterns, useDuration, useTierStyle } from "./parts";

/**
 * Une offre du jour, en laissez-passer de voyage (tegata) : talon perforé avec le sceau de la rareté
 * exigée, papier teinté et motif wagara du palier, lanternes du risque, durée, chances et gains.
 */
export function OfferCard({
  offer,
  index,
  discoveryPct,
  blockedReason,
  reduced,
  onChoose,
}: {
  offer: OfferView;
  index: number;
  discoveryPct: number;
  /** Une expédition est déjà en route, ou le groupe se repose : rien ne se lance. */
  blockedReason: "ACTIVE" | "COOLDOWN" | "PREVIEW_OFF" | null;
  reduced: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations("expedition.offer");
  const tRisk = useTranslations("expedition.risk");
  const tRarity = useTranslations("rarity");
  const duration = useDuration();
  const tier = useTierStyle(offer.minRarity);
  const rarityName = tRarity(offer.minRarity as "COMMON");
  const open = offer.state === "OPEN" && offer.staffable && blockedReason === null;

  const status =
    offer.state === "DONE"
      ? t("done")
      : offer.state === "UNAVAILABLE"
        ? t("unavailable")
        : offer.state === "LOCKED"
          ? t("locked", { need: offer.minDiscoveryPct, have: discoveryPct })
          : !offer.staffable
            ? t("needCard", { rarity: rarityName })
            : null;

  return (
    <m.li
      className="list-none"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, rotate: index % 2 ? 0.8 : -0.8 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 180, damping: 22, delay: 0.08 * index }}
    >
      <button
        type="button"
        onClick={onChoose}
        disabled={!open}
        aria-label={t("chooseLabel", { name: offer.name })}
        className={`exp-tegata ${tier.className} group flex w-full items-stretch rounded-card border border-border text-left shadow-raised transition-transform duration-200 enabled:active:scale-[.985] enabled:hover:-translate-y-0.5 motion-reduce:transition-none ${
          open ? "" : "opacity-75"
        }`}
        style={tier.style}
      >
        {/* Talon : sceau de la rareté exigée */}
        <span className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 py-4">
          <span className="inline-flex size-12 items-center justify-center rounded-[10px] border-2 bg-bg/40" style={{ borderColor: tier.tint }}>
            <RaritySeal rarity={offer.minRarity} className="text-3xl" />
          </span>
          <span className="px-1 text-center text-[10px] leading-tight font-bold" style={{ color: tier.tint }}>
            {rarityName}
          </span>
        </span>
        <span aria-hidden="true" className="exp-perforation" />

        <span className="flex min-w-0 flex-1 flex-col gap-2 py-3 pr-3 pl-4">
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="font-title text-lg leading-tight font-extrabold">{offer.name}</span>
              {offer.lore && <span className="line-clamp-2 text-xs text-text-muted">{offer.lore}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <RiskLanterns risk={offer.risk} />
              <span className="text-[10px] font-bold tracking-wide text-text-muted uppercase">{tRisk(offer.risk)}</span>
            </span>
          </span>

          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 font-bold tabular-nums">
              <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="8" cy="8" r="6.2" />
                <path d="M8 4.5V8l2.4 1.6" />
              </svg>
              {duration(offer.durationMinutes)}
            </span>
            <span className="tabular-nums text-text-muted">
              {offer.risk === "SAFE" ? t("chanceSafe") : offer.range.min === offer.range.max ? t("chanceOne", { value: offer.range.min }) : t("chance", { min: offer.range.min, max: offer.range.max })}
            </span>
            {offer.minDiscoveryPct > 0 && offer.state !== "LOCKED" && <span className="text-text-muted">{t("discovery", { need: offer.minDiscoveryPct })}</span>}
          </span>

          <RewardChips reward={offer.rewards.SUCCESS} boosterName={offer.boosterName} extraLot={offer.extraLot} />

          {status ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
              {offer.state === "DONE" && (
                <span aria-hidden="true" lang="ja" className="inline-flex size-6 -rotate-6 items-center justify-center rounded-[5px] border-2 border-shu font-seal text-xs text-shu">
                  済
                </span>
              )}
              {offer.state === "LOCKED" && (
                <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
              )}
              {status}
            </span>
          ) : (
            open && (
              <span className="inline-flex items-center gap-1 self-end text-sm font-bold text-shu">
                {t("choose")}
                <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none">
                  →
                </span>
              </span>
            )
          )}
        </span>
      </button>
    </m.li>
  );
}
