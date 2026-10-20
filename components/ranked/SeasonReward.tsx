"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { BoardTier } from "@/lib/battle/tiers";
import { claimSeasonRewardAction } from "@/server/actions/ranked";
import { Button } from "../ui/Button";
import { useRankName } from "./RankBadge";
import { RankEmblem } from "./RankEmblem";

/** Bannière de fin de saison : emblème du meilleur rang atteint et lot à réclamer (une fois). */
export function SeasonReward({ seasonId, seasonNumber, peakTier }: { seasonId: string; seasonNumber: number; peakTier: BoardTier }) {
  const t = useTranslations("ranked");
  const name = useRankName();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const claim = () =>
    startTransition(async () => {
      setError(null);
      const res = await claimSeasonRewardAction({ seasonId });
      if (!res.ok) return setError(t(`errors.${res.error}`));
      const parts = [
        res.zeni > 0 ? t("reward.zeni", { amount: res.zeni }) : null,
        res.boosters > 0 ? t("reward.boosters", { count: res.boosters }) : null,
        res.cards > 0 ? t("reward.cards", { count: res.cards }) : null,
      ].filter(Boolean);
      setDone([t("reward.claimed"), ...parts].join(" · "));
    });

  return (
    <aside className="battle-board battle-rim rounded-card p-[3px]" data-tier={peakTier}>
      <div className="battle-table flex flex-col items-center gap-3 rounded-[10px] p-4 text-center text-washi-paper sm:flex-row sm:text-left">
        <RankEmblem tier={peakTier} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-title text-lg font-extrabold">{t("reward.title", { number: seasonNumber })}</p>
          <p className="text-sm text-[#cfc6b8]">{t("reward.text", { tier: name(peakTier, null) })}</p>
          {(done || error) && (
            <p role="status" className={`text-sm font-bold ${error ? "text-shu" : "text-kin"}`}>
              {done ?? error}
            </p>
          )}
        </div>
        {!done && (
          <Button variant="primary" onClick={claim} disabled={pending}>
            {t("reward.claim")}
          </Button>
        )}
      </div>
    </aside>
  );
}
