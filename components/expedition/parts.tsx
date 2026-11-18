"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { rarityColor } from "@/lib/catalog/appearance";
import { useRarityDefinitions, useRaritySeals } from "@/lib/catalog/use-rarities";
import type { RewardBundle } from "@/lib/expedition/rewards";
import type { ExpeditionRisk } from "@/lib/expedition/types";
import type { ExtraLotView } from "@/lib/expedition/view";
import { ZeniCoin } from "../layout/ZeniCoin";

// Petites pièces partagées par l'écran des expéditions : habillage d'un palier, lanternes du risque,
// lignes de gains, durée.

const WAGARA: Record<string, string> = {
  EPIC: "wagara-seigaiha",
  LEGENDARY: "wagara-asanoha",
  MYTHIC: "wagara-shippo",
  BR: "wagara-shippo",
  AR: "wagara-sakura",
  VR: "wagara-sakura",
  GOLD: "wagara-kin",
  MR: "wagara-kin",
  XR: "wagara-raden",
};

/** Motif et teinte d'un palier de rareté (laissez-passer, bandeau du voyage). */
export function useTierStyle(rarity: string): { className: string; style: CSSProperties; tint: string } {
  const definitions = useRarityDefinitions();
  const tint = rarityColor(rarity, definitions.find((d) => d.key === rarity)?.appearance);
  return {
    className: WAGARA[rarity] ?? "wagara-kumo",
    tint,
    style: { "--exp-tint": tint, "--wl": `color-mix(in srgb, ${tint} 70%, transparent)` } as CSSProperties,
  };
}

const LIT: Record<ExpeditionRisk, number> = { SAFE: 1, BALANCED: 2, RISKY: 3 };

/** Trois lanternes 提灯 : plus il y en a d'allumées, plus l'expédition est risquée. */
export function RiskLanterns({ risk, className = "" }: { risk: ExpeditionRisk; className?: string }) {
  const t = useTranslations("expedition.risk");
  const lit = LIT[risk];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={t(risk)}>
      {[0, 1, 2].map((i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 12 16" width="10" height="14" className={i < lit ? (risk === "RISKY" ? "text-shu" : "text-kin") : "text-border"}>
          <path d="M4 1h4M6 1v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <rect x="1.5" y="2.5" width="9" height="11" rx="4.5" fill="currentColor" opacity={i < lit ? 1 : 0.5} />
          <path d="M1.8 6h8.4M1.8 10h8.4" stroke="var(--color-bg)" strokeWidth="0.8" opacity="0.6" />
          <path d="M4 14.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ))}
    </span>
  );
}

/** Sceau kanji d'une rareté, dans sa teinte. */
export function RaritySeal({ rarity, className = "" }: { rarity: string; className?: string }) {
  const seals = useRaritySeals();
  const { tint } = useTierStyle(rarity);
  return (
    <span aria-hidden="true" lang="ja" className={`font-seal leading-none ${className}`} style={{ color: tint }}>
      {seals[rarity] ?? "?"}
    </span>
  );
}

/** « 2 h », « 1 h 30 », « 45 min ». */
export function useDuration() {
  const t = useTranslations("expedition.duration");
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return t("m", { minutes: m });
    return m === 0 ? t("h", { hours: h }) : t("hm", { hours: h, minutes: String(m).padStart(2, "0") });
  };
}

/** Mini sachet de booster (gains). */
function MiniSachet() {
  return (
    <svg aria-hidden="true" viewBox="0 0 14 18" width="12" height="16" className="shrink-0 text-shu">
      <path d="M1 2.2 2.5 1l1.5 1.2L5.5 1 7 2.2 8.5 1 10 2.2 11.5 1 13 2.2V17H1Z" fill="currentColor" />
      <rect x="4" y="5" width="6" height="8" rx="1" fill="var(--color-washi-paper)" opacity="0.9" />
    </svg>
  );
}

/** Gains d'une issue : Zeni, boosters et lot bonus, en pastilles. */
export function RewardChips({
  reward,
  boosterName,
  extraLot,
  size = "sm",
}: {
  reward: RewardBundle;
  boosterName: string;
  extraLot: ExtraLotView | null;
  size?: "sm" | "md";
}) {
  const t = useTranslations("expedition.reward");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const chip = `inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-2 ${size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs"} font-bold tabular-nums`;
  const showLot = reward.extraLot && extraLot;
  if (reward.zeni <= 0 && reward.boosters <= 0 && !showLot) return <span className="text-xs text-text-muted">{t("nothing")}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {reward.zeni > 0 && (
        <span className={chip}>
          <ZeniCoin size={14} />
          {t("zeni", { amount: format.number(reward.zeni) })}
        </span>
      )}
      {reward.boosters > 0 && (
        <span className={chip} title={boosterName}>
          <MiniSachet />
          {t("boosters", { count: reward.boosters })}
        </span>
      )}
      {showLot &&
        extraLot.cards.map((c) => (
          <span key={c.rarity} className={`${chip} border-kin/60 text-kin`}>
            <RaritySeal rarity={c.rarity} className="text-sm" />
            {t("cards", { count: c.quantity, rarity: tRarity(c.rarity as "COMMON") })}
          </span>
        ))}
      {showLot && extraLot.namedCards > 0 && <span className={`${chip} border-kin/60 text-kin`}>{t("namedCards", { count: extraLot.namedCards })}</span>}
      {showLot && extraLot.boosters > 0 && (
        <span className={chip}>
          <MiniSachet />
          {t("bonusBoosters", { count: extraLot.boosters })}
        </span>
      )}
      {showLot && extraLot.zeni > 0 && (
        <span className={chip}>
          <ZeniCoin size={14} />
          {t("zeni", { amount: format.number(extraLot.zeni) })}
        </span>
      )}
    </span>
  );
}
