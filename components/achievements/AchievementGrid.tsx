"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { RANK_SEAL, type AchievementRank } from "@/lib/achievements/catalog";
import { RANK_STYLE } from "@/lib/achievements/style";
import { featureAchievementAction, type FeatureAchievementError } from "@/server/actions/achievements";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/** Tuile prête à afficher : textes traduits et secrets masqués côté serveur. */
export type AchievementTileView = {
  key: string;
  rank: AchievementRank;
  name: string;
  desc: string;
  unlocked: boolean;
  /** « Débloqué le 12 nov. 2026 » ; null tant que verrouillé. */
  unlockedLabel: string | null;
  /** « 3 527 / 5 000 », « Meilleure place : 143 », « À faire »… */
  progressLabel: string;
  /** Remplissage de la barre, de 0 à 1. */
  ratio: number;
  /** Secret encore verrouillé : « ??? », sans barre. */
  hidden: boolean;
};

export type AchievementSection = {
  category: string;
  kanji: string;
  title: string;
  tiles: AchievementTileView[];
};

type Filter = "all" | "unlocked" | "locked";
const FILTERS: readonly Filter[] = ["all", "unlocked", "locked"];

/**
 * Grille des succès : 2 colonnes sur mobile, 3 sur tablette, 4 sur grand écran. Une tuile verrouillée est grisée ;
 * une tuile débloquée propose de mettre le succès en avant sous l'avatar (compte inscrit).
 */
export function AchievementGrid({ sections, featured, canFeature }: { sections: AchievementSection[]; featured: string | null; canFeature: boolean }) {
  const t = useTranslations("achievements.grid");
  const [filter, setFilter] = useState<Filter>("all");
  const [current, setCurrent] = useState(featured);
  const [error, setError] = useState<FeatureAchievementError | "unexpected" | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) => {
    const next = current === key ? null : key;
    setError(null);
    startTransition(async () => {
      try {
        const res = await featureAchievementAction({ key: next });
        if (res.ok) setCurrent(next);
        else setError(res.error);
      } catch {
        // Réseau coupé ou erreur serveur : un message, pas l'écran d'erreur à la place de la grille
        setError("unexpected");
      }
    });
  };

  const shown = sections
    .map((s) => ({ ...s, visible: s.tiles.filter((tile) => (filter === "all" ? true : filter === "unlocked" ? tile.unlocked : !tile.unlocked)) }))
    .filter((s) => s.visible.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div role="group" aria-label={t("filterLabel")} className={segmentedTrackClass}>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={segmentedItemClass}>
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
        {!canFeature && <p className="text-xs text-text-muted">{t("guestHint")}</p>}
        {error && (
          <p role="alert" className="text-sm text-shu">
            {t(`errors.${error}`)}
          </p>
        )}
      </div>

      {shown.length === 0 && <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{t("empty")}</p>}

      {shown.map((section) => {
        const done = section.tiles.filter((tile) => tile.unlocked).length;
        return (
          <section key={section.category} aria-labelledby={`succes-${section.category}`} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span aria-hidden="true" lang="ja" className="font-seal text-lg text-shu">
                {section.kanji}
              </span>
              <h2 id={`succes-${section.category}`} className="font-title text-lg font-extrabold">
                {section.title}
              </h2>
              <span className="text-xs font-bold text-text-muted tabular-nums">{t("count", { done, total: section.tiles.length })}</span>
            </div>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4">
              {section.visible.map((tile) => (
                <AchievementTile
                  key={tile.key}
                  tile={tile}
                  featured={current === tile.key}
                  onFeature={canFeature && tile.unlocked ? () => toggle(tile.key) : undefined}
                  pending={pending}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AchievementTile({ tile, featured, onFeature, pending }: { tile: AchievementTileView; featured: boolean; onFeature?: () => void; pending: boolean }) {
  const t = useTranslations("achievements.grid");
  const rank = RANK_STYLE[tile.rank];
  return (
    <li
      className={`relative flex min-w-0 flex-col gap-2 rounded-card border bg-surface p-3 ${
        tile.unlocked ? (featured ? "border-kin shadow-[0_0_0_1px_var(--color-kin),0_0_24px_-10px_var(--color-kin)]" : rank.border) : "border-border opacity-60 grayscale"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden="true" lang="ja" className={`flex size-10 shrink-0 items-center justify-center rounded-control border font-seal text-xl ${rank.seal}`}>
          {tile.hidden ? "秘" : RANK_SEAL[tile.rank]}
        </span>
        {featured && <span className="rounded-full border border-kin/50 bg-kin/10 px-2 py-0.5 text-[11px] font-bold text-kin">{t("featured")}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-title text-sm leading-tight font-bold break-words">{tile.name}</p>
        <p className="text-xs leading-snug break-words text-text-muted">{tile.desc}</p>
      </div>
      <div className="mt-auto flex flex-col gap-1">
        {!tile.hidden && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(tile.ratio * 100)}
            aria-valuetext={tile.progressLabel}
            aria-label={tile.name}
            className="h-2 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]"
          >
            <div
              className={`h-full w-full origin-left rounded-full ${tile.unlocked ? "bg-[linear-gradient(90deg,var(--color-kin),#f2d88a)]" : "bg-ai"}`}
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, tile.ratio))})` }}
            />
          </div>
        )}
        <p className="text-[11px] font-bold text-text-muted tabular-nums">{tile.unlocked && tile.unlockedLabel ? tile.unlockedLabel : tile.progressLabel}</p>
      </div>
      {onFeature && (
        <button
          type="button"
          onClick={onFeature}
          disabled={pending}
          aria-pressed={featured}
          className={`min-h-11 rounded-control border px-2 text-xs font-bold disabled:opacity-60 ${
            featured ? "border-kin/60 text-kin hover:bg-kin/10" : "border-border text-text hover:border-text-muted"
          }`}
        >
          {featured ? t("unfeature") : t("feature")}
        </button>
      )}
    </li>
  );
}
