"use client";

import { useTranslations } from "next-intl";
import type { BoardTier } from "@/lib/battle/tiers";
import type { LotView } from "@/server/economy/lot-view";
import { useRankName } from "./RankBadge";

/**
 * « Votre récompense à la fin de la saison : … » sous le rang du joueur : le lot de son meilleur rang
 * de la saison, en toutes lettres (Zeni, boosters, cartes), pour qu'il sache ce qui l'attend.
 */
export function SeasonRewardPreview({
  reward,
  currentTier,
}: {
  reward: { tier: BoardTier; lot: LotView; played: boolean };
  currentTier: BoardTier;
}) {
  const t = useTranslations("ranked.seasonReward");
  const tLot = useTranslations("economy.lot");
  const tRarity = useTranslations("rarity");
  const name = useRankName();
  const { lot } = reward;

  const parts = [
    ...(lot.zeni > 0 ? [tLot("zeni", { amount: lot.zeni })] : []),
    ...lot.lines.map((line) =>
      line.kind === "BOOSTER"
        ? tLot("booster", { count: line.quantity, name: line.name })
        : line.kind === "CARD"
          ? tLot("card", { count: line.quantity, name: line.name, rarity: tRarity(line.rarity) })
          : tLot("rarityCard", { count: line.quantity, rarity: tRarity(line.rarity) }),
    ),
  ];
  if (parts.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-[var(--board-accent)]/40 px-3 py-2 text-sm">
      <p>
        <span aria-hidden="true" lang="ja" className="mr-1.5 font-seal text-[var(--board-accent)]">
          賞
        </span>
        {t("label", { reward: parts.join(", ") })}
      </p>
      {reward.tier !== currentTier && <p className="text-xs text-[#a89f92]">{t("peak", { tier: name(reward.tier, null) })}</p>}
      {!reward.played && <p className="text-xs text-[#a89f92]">{t("playToEarn")}</p>}
    </div>
  );
}
