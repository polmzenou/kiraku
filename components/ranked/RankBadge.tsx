"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { BoardTier } from "@/lib/battle/tiers";
import type { LadderInfo } from "@/server/ranked/queries";
import { RankEmblem } from "./RankEmblem";
import { RankLadderSheet } from "./RankLadderSheet";

/** Nom du rang avec sa division : « Or II », « Grand Champion ». */
export function useRankName() {
  const t = useTranslations("ranked");
  return (tier: BoardTier, division: 1 | 2 | 3 | null) =>
    division ? t("rank", { tier: t(`tiers.${tier}`), division: t(`divisions.${division}`) }) : t(`tiers.${tier}`);
}

/** Barre de progression dans la division (transform seulement). */
export function DivisionBar({ progress, tier }: { progress: number; tier: BoardTier }) {
  return (
    <span className="battle-board block h-2 w-full overflow-hidden rounded-full bg-sumi/60" data-tier={tier} aria-hidden="true">
      <span
        className="block h-full origin-left rounded-full bg-[var(--board-accent)] transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
      />
    </span>
  );
}

/** Rang d'un joueur : emblème, nom, PC et barre de division (Grand Champion : sa place dans le top). */
export function RankBadge({
  tier,
  division,
  pc,
  progress,
  next,
  nextRank = null,
  grand = null,
  ladder = null,
  size = 72,
}: {
  tier: BoardTier;
  division: 1 | 2 | 3 | null;
  pc: number;
  progress: number;
  next: number | null;
  nextRank?: { tier: BoardTier; division: 1 | 2 | 3 | null } | null;
  /** Grand Champion : place dans le top, à la place de la barre (dernier rang, rien au-dessus). */
  grand?: { position: number; top: number } | null;
  /** Paliers de tous les rangs : bouton « i » à côté de l'emblème, qui les affiche. */
  ladder?: LadderInfo | null;
  size?: number;
}) {
  const t = useTranslations("ranked");
  const name = useRankName();
  const [showLadder, setShowLadder] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <RankEmblem tier={tier} division={division} size={size} label={name(tier, division)} />
        {ladder && (
          // Pastille de 24 px, zone tactile étendue à 44 px par le pseudo-élément
          <button
            type="button"
            onClick={() => setShowLadder(true)}
            aria-haspopup="dialog"
            aria-label={t("ladder.open")}
            title={t("ladder.open")}
            className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full border border-washi-paper/40 bg-sumi font-title text-sm font-bold italic text-washi-paper transition-transform after:absolute after:-inset-2.5 after:content-[''] hover:scale-110 motion-reduce:transition-none"
          >
            <span aria-hidden="true">i</span>
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-title text-lg font-extrabold leading-tight">{name(tier, division)}</span>
        <span className="text-sm tabular-nums text-text-muted">{t("pc", { pc })}</span>
        {tier !== "GRAND_CHAMPION" && <DivisionBar progress={progress} tier={tier} />}
        {next !== null && tier !== "GRAND_CHAMPION" && (
          <span className="text-xs tabular-nums text-text-muted">
            {t("toNext", { count: Math.max(0, next - pc), target: nextRank ? name(nextRank.tier, nextRank.division) : String(next) })}
          </span>
        )}
        {tier === "GRAND_CHAMPION" && grand && (
          <span className="text-xs tabular-nums text-text-muted">{t("grandPosition", { position: grand.position, top: grand.top })}</span>
        )}
      </div>
      {ladder && showLadder && <RankLadderSheet ladder={ladder} current={tier} onClose={() => setShowLadder(false)} />}
    </div>
  );
}
