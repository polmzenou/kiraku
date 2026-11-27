"use client";

import { useTranslations } from "next-intl";
import type { OpenedCardView } from "@/lib/boosters/view";
import { frescoProgress, type FrescoDropView } from "@/lib/fresco/view";
import { FrescoMap } from "../fresco/FrescoView";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button } from "../ui/Button";

type Drop = FrescoDropView<OpenedCardView>;

/** Ce qu'un fragment a rapporté : un tampon par ligne, colonne ou fresque complète, et le contenu des lots. */
export function FrescoRewardList({ drop, className = "" }: { drop: Drop; className?: string }) {
  const t = useTranslations("fresco");
  if (drop.rewards.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {drop.rewards.map((r) => (
        <li key={`${r.kind}-${r.index}`} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
          <span className={`font-bold ${r.kind === "PIECE" ? "" : "text-kin"}`}>{t(`rewardKinds.${r.kind}`, { index: r.index + 1 })}</span>
          {r.lotName && <span className="text-text-muted">· {r.lotName}</span>}
          {r.reward && r.reward.zeni > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-kin">
              <ZeniCoin size={14} />
              {t("zeni", { amount: r.reward.zeni })}
            </span>
          )}
          {r.reward && r.reward.boosters > 0 && <span className="text-text-muted">{t("boosters", { count: r.reward.boosters })}</span>}
          {r.reward && r.reward.cards.length > 0 && <span className="text-text-muted">{t("cards", { count: r.reward.cards.length })}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Rangée « Fragments de fresque » du récap : mini-carte, progression, récompenses, et « Revoir ». */
export function FrescoRecap({ drops, onReplay }: { drops: Drop[]; onReplay: (index: number) => void }) {
  const t = useTranslations("fresco");
  return (
    <section aria-labelledby="recap-fresco" className="mx-auto mb-6 flex w-full max-w-md flex-col gap-3 rounded-card border border-kin bg-surface p-4">
      <h2 id="recap-fresco" className="flex items-center gap-2 font-title text-lg font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">
          絵
        </span>
        {t("recapTitle", { count: drops.length })}
      </h2>
      <ul className="flex flex-col gap-3">
        {drops.map((d, i) => {
          const { owned, total, complete } = frescoProgress(d.fresco);
          return (
            <li key={`${d.fresco.id}-${d.position}`} className="flex items-center gap-3">
              <FrescoMap cols={d.fresco.cols} rows={d.fresco.rows} owned={d.fresco.pieces.map((p) => p.position)} fresh={d.position} className="w-16 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <p className="max-w-full truncate font-bold">{d.fresco.name}</p>
                <p className={`text-xs tabular-nums ${complete ? "font-bold text-kin" : "text-text-muted"}`}>{complete ? t("complete") : t("progress", { owned, total })}</p>
                <FrescoRewardList drop={{ ...d, rewards: d.rewards.filter((r) => r.kind !== "PIECE" || r.reward) }} className="items-start [&>li]:justify-start" />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => onReplay(i)}>
                {t("replay")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
