import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import type { FrescoRewardKind } from "@/lib/fresco/progress";
import { frescoProgress, type FrescoView } from "@/lib/fresco/view";
import { spoilerImageAttrs } from "@/lib/spoiler";
import type { LotView } from "@/server/economy/lot-view";
import { LotRewards } from "../economy/LotRewards";
import { FrescoView as FrescoBoard } from "../fresco/FrescoView";

export type NewFresco = {
  id: string;
  name: string;
  publishedAt: string;
  /** Aperçu de 48 px, flouté : jamais l'image elle-même. */
  teaserUrl: string | null;
  cols: number;
  rows: number;
  spoiler: boolean;
  spoilerKey: string | null;
  isNew: boolean;
  /** Boosters d'où elle tombe ; null = tous. */
  boosters: string[] | null;
  rewards: { kind: FrescoRewardKind; lot: LotView | null }[];
};

/**
 * Une fresque de l'onglet « Nouvelles fresques » : aperçu flouté (l'image ne se découvre que fragment par
 * fragment), date, boosters d'où elle tombe, lots de chaque récompense et progression du lecteur.
 */
export function NewFrescoCard({ fresco, progress, guest }: { fresco: NewFresco; progress: FrescoView | null; guest: boolean }) {
  const t = useTranslations("fresco");
  const format = useFormatter();
  const rewards = fresco.rewards.filter((r) => r.lot !== null);
  const total = fresco.cols * fresco.rows;
  const mine = progress ? frescoProgress(progress) : null;
  return (
    <article className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 md:flex-row md:items-start">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-control bg-surface-2 md:w-72" style={{ aspectRatio: `${fresco.cols} / ${fresco.rows}` }}>
        {fresco.teaserUrl && (
          // Aperçu de 48 px agrandi et flouté : on n'y lit que les couleurs
          <Image
            src={fresco.teaserUrl}
            alt={t("news.teaser", { name: fresco.name })}
            fill
            sizes="(min-width: 768px) 288px, 100vw"
            className="scale-125 object-cover blur-xl"
            {...spoilerImageAttrs(fresco.spoiler, fresco.spoilerKey)}
          />
        )}
        <span aria-hidden="true" lang="ja" className="absolute inset-0 flex items-center justify-center font-seal text-5xl text-washi-paper/80">
          絵
        </span>
        {fresco.isNew && <span className="absolute top-2 left-2 rounded-pill bg-shu-btn px-2 py-0.5 text-xs font-bold text-washi-paper">{t("news.newBadge")}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-title text-xl font-extrabold">{fresco.name}</h3>
          <p className="text-xs text-text-muted">
            {t("news.published", { date: format.dateTime(new Date(fresco.publishedAt), { day: "numeric", month: "long", year: "numeric" }) })} ·{" "}
            {t("news.fragments", { count: total })}
          </p>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("news.where")}</dt>
            <dd>{fresco.boosters === null ? t("news.allBoosters") : fresco.boosters.join(" · ")}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("news.rewards")}</dt>
            {rewards.length === 0 ? (
              <dd className="text-text-muted">{t("news.noReward")}</dd>
            ) : (
              rewards.map((r) => (
                <dd key={r.kind} className="flex flex-col gap-1">
                  <span className="font-bold">{t(`news.rewardLabels.${r.kind}`)}</span>
                  <LotRewards lot={r.lot ?? undefined} />
                </dd>
              ))
            )}
          </div>
        </dl>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("news.yourProgress")}</p>
          {progress && mine ? (
            <>
              <FrescoBoard fresco={progress} label={mine.complete ? t("labelComplete", { name: progress.name }) : t("label", { name: progress.name, owned: mine.owned, total: mine.total })} className="max-w-72" />
              <p className={`text-sm tabular-nums ${mine.complete ? "font-bold text-kin" : ""}`}>{mine.complete ? t("complete") : t("progress", { owned: mine.owned, total: mine.total })}</p>
            </>
          ) : (
            <p className="text-sm text-text-muted">{guest ? t("news.guest") : t("news.notStarted")}</p>
          )}
        </div>
      </div>
    </article>
  );
}
