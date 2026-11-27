"use client";

import { useTranslations } from "next-intl";
import { useState, type CSSProperties } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { cellCount, columnPositions, rowPositions, type Grid } from "@/lib/fresco/grid";
import { earnedRewards, type FrescoRewardKind } from "@/lib/fresco/progress";
import type { FrescoDropView, FrescoView } from "@/lib/fresco/view";
import { THEME_IDS, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import type { LotView } from "@/server/economy/lot-view";
import { FrescoPlate, useFrescoLabel } from "../../fresco/FrescoPlate";
import { FrescoStage } from "../../fresco/FrescoStage";
import { FrescoFragmentReveal } from "../../opening/FrescoFragmentReveal";
import { SectionTitle } from "../../SectionTitle";
import { ShowcaseViewSwitch } from "../../showcase/ShowcaseViewSwitch";
import { segmentedCompactItemClass, segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "../../ui/Segmented";
import { NewFrescoCard } from "../../wiki/NewFrescoCard";
import "./fresco-admin.css";

type Mode = "profile" | "opening" | "news";
type Preset = "none" | "one" | "row" | "column" | "complete";

export type PreviewSource = Grid & {
  name: string;
  pieces: { position: number; imageUrl: string }[];
  fullImageUrl: string | null;
  teaserUrl: string | null;
  spoiler: boolean;
};

/**
 * Aperçu en direct d'une fresque, avec les composants mêmes des joueurs : la vitrine du profil (et sa
 * mini-navigation), la révélation à l'ouverture, la carte de l'onglet Nouveautés. L'admin choisit ce que le
 * joueur possède en touchant les cases ; le dernier fragment touché est celui qui « tombe ».
 */
export function FrescoPreview({
  source,
  lots,
  boosters,
  publishedAt,
}: {
  source: PreviewSource | null;
  lots: Record<"piece" | "row" | "column" | "complete", LotView | null>;
  /** Boosters d'où elle tombe (noms) ; null = tous. */
  boosters: string[] | null;
  publishedAt: string | null;
}) {
  const t = useTranslations("admin.frescoes.preview");
  const tShowcase = useTranslations("showcase");
  const label = useFrescoLabel();
  const [mode, setMode] = useState<Mode>("profile");
  const [owned, setOwned] = useState<Set<number>>(() => new Set([0, 1, 2, 5, 6]));
  const [last, setLast] = useState(6);
  const [theme, setTheme] = useState<ShowcaseThemeId>("black-edition");
  const [frame, setFrame] = useState<"phone" | "desktop">("phone");
  const [light, setLight] = useState(false);
  const [replay, setReplay] = useState(0);

  if (!source || source.pieces.length < cellCount(source)) {
    return <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-text-muted">{t("noImage")}</p>;
  }
  const total = cellCount(source);
  const toggle = (p: number) =>
    setOwned((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else {
        next.add(p);
        setLast(p);
      }
      return next;
    });
  const preset = (p: Preset) => {
    const list =
      p === "none" ? [] : p === "one" ? [5] : p === "row" ? rowPositions(0, source) : p === "column" ? columnPositions(0, source) : Array.from({ length: total }, (_, i) => i);
    setOwned(new Set(list));
    setLast(list.at(-1) ?? 0);
  };
  const complete = owned.size === total;
  const view: FrescoView = {
    id: "preview",
    name: source.name,
    cols: source.cols,
    rows: source.rows,
    pieces: source.pieces.filter((p) => owned.has(p.position)),
    fullImageUrl: complete ? source.fullImageUrl : null,
    spoiler: false,
    spoilerKey: null,
  };
  // Révélation : le dernier fragment touché vient de tomber (s'il n'est pas possédé, on le prend quand même)
  const fallen = owned.has(last) ? last : [...owned].at(-1) ?? 0;
  const before = new Set(owned);
  before.delete(fallen);
  const lotKey: Record<FrescoRewardKind, keyof typeof lots> = { PIECE: "piece", ROW: "row", COLUMN: "column", COMPLETE: "complete" };
  const drop: FrescoDropView<OpenedCardView> = {
    fresco: { ...view, pieces: source.pieces.filter((p) => owned.has(p.position) || p.position === fallen) },
    position: fallen,
    rewards: earnedRewards(before, [fallen], source).map((r) => {
      const lot = lots[lotKey[r.kind]];
      return { ...r, lotName: lot?.name ?? null, reward: lot ? { zeni: lot.zeni, boosters: lot.lines.filter((l) => l.kind === "BOOSTER").reduce((s, l) => s + l.quantity, 0), cards: [] } : null };
    }),
  };

  const track = `${segmentedTrackClass} ${segmentedFillClass}`;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("title")} className={track}>
        {(["profile", "opening", "news"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={segmentedCompactItemClass}>
            {t(`tabs.${m}`)}
          </button>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">
          {t("owned")} · {owned.size}/{total}
        </legend>
        <div className="fra-cells" style={{ "--fr-cols": source.cols } as CSSProperties}>
          {source.pieces
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((p) => (
              <button key={p.position} type="button" aria-pressed={owned.has(p.position)} aria-label={t("cell", { n: p.position + 1 })} onClick={() => toggle(p.position)} className="fra-cell">
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale de l'aperçu, déjà découpée */}
                <img src={p.imageUrl} alt="" draggable={false} />
              </button>
            ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["none", "one", "row", "column", "complete"] as const).map((p) => (
            <button key={p} type="button" onClick={() => preset(p)} className="min-h-11 rounded-control border border-border bg-surface-2 px-3 text-xs font-bold">
              {t(`presets.${p}`)}
            </button>
          ))}
        </div>
        {mode === "opening" && <p className="text-xs text-text-muted">{t("lastPiece")}</p>}
      </fieldset>

      {mode === "profile" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("theme")}
            <select value={theme} onChange={(e) => setTheme(e.target.value as ShowcaseThemeId)} className="min-h-11 rounded-control border border-border bg-surface-2 px-2 text-sm text-text">
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>
                  {tShowcase(`themes.${id}.name`)}
                </option>
              ))}
            </select>
          </label>
          <div className={segmentedTrackClass}>
            {(["phone", "desktop"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={frame === f} onClick={() => setFrame(f)} className={segmentedItemClass}>
                {t(`frame.${f}`)}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="choice" checked={light} onChange={(e) => setLight(e.target.checked)} />
            {t("light")}
          </label>
        </div>
      )}

      <div data-theme={light ? "washi" : undefined} className="overflow-hidden rounded-card border border-border bg-bg p-3 text-text">
        {mode === "profile" && (
          <div data-fr-frame={frame} className={frame === "phone" ? "mx-auto w-[375px] max-w-full px-4" : "w-full"}>
            <section className="flex flex-col gap-4 py-4">
              <ShowcaseViewSwitch
                key={`${frame}-${replay}`}
                title={<SectionTitle kanji="飾" title={tShowcase("titlePublic")} />}
                initial="fresco"
                cards={<p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-text-muted">{t("cardsPlaceholder")}</p>}
                fresco={
                  <>
                    <FrescoStage fresco={view} theme={theme} label={label(view)} />
                    <FrescoPlate fresco={view} />
                  </>
                }
              />
            </section>
          </div>
        )}
        {mode === "opening" && (
          <div className="flex flex-col items-center gap-3">
            <FrescoFragmentReveal key={`${replay}-${fallen}-${owned.size}`} drops={[drop]} onDone={() => setReplay((r) => r + 1)} inline />
            <button type="button" onClick={() => setReplay((r) => r + 1)} className="min-h-11 text-sm text-link underline">
              {t("replay")}
            </button>
          </div>
        )}
        {mode === "news" && (
          <NewFrescoCard
            guest={false}
            progress={owned.size > 0 ? view : null}
            fresco={{
              id: "preview",
              name: source.name,
              publishedAt: publishedAt ?? new Date().toISOString(),
              teaserUrl: source.teaserUrl,
              cols: source.cols,
              rows: source.rows,
              spoiler: false,
              spoilerKey: null,
              isNew: true,
              boosters,
              rewards: (["PIECE", "ROW", "COLUMN", "COMPLETE"] as const).map((kind) => ({ kind, lot: lots[lotKey[kind]] })),
            }}
          />
        )}
      </div>
    </div>
  );
}
