"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { RankedSideView } from "@/lib/battle/view";
import { rankOf, type RankedRules } from "@/lib/ranked/rules";
import { DivisionBar, useRankName } from "./RankBadge";
import { RankEmblem } from "./RankEmblem";

export type Ladder = Pick<RankedRules, "tiers" | "grandChampion">;

/**
 * Bilan classé de l'écran de fin : emblème du rang obtenu, PC gagnés ou perdus, barre de division
 * qui part de l'ancienne position (transform), montée, descente, protection, Grand Champion.
 */
export function RankedResult({
  side,
  won,
  crushing,
  ladder,
  bot,
}: {
  side: RankedSideView;
  won: boolean | null;
  crushing: boolean;
  ladder: Ladder;
  bot: boolean;
}) {
  const t = useTranslations("ranked");
  const name = useRankName();
  const before = rankOf(side.before, side.grandBefore, ladder);
  const after = rankOf(side.after, side.grandAfter, ladder);
  const sameDivision = before.tier === after.tier && before.division === after.division;
  const [progress, setProgress] = useState(sameDivision ? before.progress : after.progress);

  useEffect(() => {
    const id = setTimeout(() => setProgress(after.progress), 350);
    return () => clearTimeout(id);
  }, [after.progress]);

  const sign = side.delta > 0 ? "+" : side.delta < 0 ? "−" : "±";
  const banner = side.grandAfter && !side.grandBefore
    ? t("result.grand")
    : side.promoted
      ? t("result.promoted", { tier: t(`tiers.${after.tier}`) })
      : side.demoted
        ? t("result.demoted", { tier: t(`tiers.${after.tier}`) })
        : side.saved
          ? t("result.saved", { tier: t(`tiers.${after.tier}`) })
          : null;

  return (
    <div className="battle-board flex w-full flex-col items-center gap-2 rounded-xl border border-[var(--board-accent)]/50 bg-[#15120f] p-3 text-washi-paper" data-tier={after.tier}>
      <div className="flex w-full items-center gap-3">
        <RankEmblem tier={after.tier} division={after.division} size={56} label={name(after.tier, after.division)} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="font-title text-base font-extrabold">{name(after.tier, after.division)}</span>
          <span className="text-xs tabular-nums text-[#a89f92]">{t("pc", { pc: side.after })}</span>
          {after.tier !== "GRAND_CHAMPION" && <DivisionBar progress={progress} tier={after.tier} />}
        </div>
        <span className={`font-title text-2xl font-extrabold tabular-nums ${side.delta > 0 ? "text-[#9be07a]" : side.delta < 0 ? "text-[#ff7a5f]" : "text-[#a89f92]"}`}>
          {t("result.delta", { value: `${sign}${Math.abs(side.delta)}` })}
        </span>
      </div>
      {crushing && won !== null && (
        <p className="font-title text-sm font-extrabold text-[var(--board-accent)]">{won ? t("result.crushing") : t("result.crushed")}</p>
      )}
      {banner && <p className="rounded-md border border-[var(--board-accent)] px-3 py-1 font-title text-sm font-extrabold text-kin">{banner}</p>}
      {side.protection > 0 && side.promoted && <p className="text-xs text-[#a89f92]">{t("protection", { count: side.protection })}</p>}
      {bot && <p className="text-xs text-[#a89f92]">{t("result.bot")}</p>}
    </div>
  );
}
