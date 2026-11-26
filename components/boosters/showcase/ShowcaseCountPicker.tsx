"use client";

import { useTranslations } from "next-intl";
import { OPEN_COUNTS, type OpenChoice } from "@/lib/boosters/catalog";
import { priceFor, type BoosterTypeView } from "@/lib/boosters/types";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "../../ui/Segmented";

/**
 * Nombre de boosters à ouvrir dans la vitrine : ×1 / ×5 / ×10 / Tous. « hero » : puces à l'encre du booster
 * choisi (desktop) ; « page » : piste segmentée pleine largeur sous le hero (mobile). Une quantité que ni le
 * stock ni le prix ne couvrent est désactivée, « Tous » aussi sans stock gratuit à vider.
 */
export function ShowcaseCountPicker({
  tone,
  type,
  stock,
  choice,
  allCount,
  onChange,
}: {
  tone: "hero" | "page";
  type: Pick<BoosterTypeView, "usesFreeStock" | "priceZeni">;
  stock: number;
  choice: OpenChoice;
  allCount: number;
  onChange: (count: OpenChoice) => void;
}) {
  const t = useTranslations("opening");
  const chipClass =
    tone === "hero"
      ? "min-w-11 px-2 text-sm font-bold text-[var(--ink-2)] tabular-nums transition-colors aria-pressed:bg-[var(--ink)] aria-pressed:text-[var(--ink-bg)] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      : `${segmentedItemClass} min-w-11 px-2! tabular-nums disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <fieldset className={tone === "hero" ? "shrink-0" : "w-full"}>
      <legend className="sr-only">{t("count")}</legend>
      <div
        className={
          tone === "hero"
            ? "inline-grid h-14 grid-flow-col overflow-hidden rounded-control border border-[var(--chip-b)] bg-[var(--chip)]"
            : `${segmentedTrackClass} ${segmentedFillClass} h-12`
        }
      >
        {OPEN_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={choice === n}
            disabled={priceFor(type, stock, n).kind === "unavailable"}
            onClick={() => onChange(n)}
            className={chipClass}
          >
            {t("times", { n })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={choice === "all"}
          aria-label={allCount > 0 ? t("allCount", { n: allCount }) : undefined}
          disabled={allCount === 0}
          onClick={() => onChange("all")}
          className={chipClass}
        >
          {t("all")}
        </button>
      </div>
    </fieldset>
  );
}
