"use client";

import { useTranslations } from "next-intl";
import { OPEN_COUNTS, type OpenChoice } from "@/lib/boosters/catalog";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/**
 * Sélecteur ×1 / ×5 / ×10 / Tous ; une quantité au-delà de `max` (stock ou Zeni) est désactivée,
 * « Tous » aussi quand `all` vaut 0 (moins de 2 boosters gratuits ou crédités).
 */
export function CountPicker({
  value,
  max,
  all,
  onChange,
}: {
  value: OpenChoice;
  max: number;
  all: number;
  onChange: (count: OpenChoice) => void;
}) {
  const t = useTranslations("opening");
  const item = `${segmentedItemClass} min-w-16 tabular-nums disabled:cursor-not-allowed disabled:opacity-40`;
  return (
    <fieldset className="flex flex-col items-center">
      <legend className="sr-only">{t("count")}</legend>
      <div className={segmentedTrackClass}>
        {OPEN_COUNTS.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} disabled={n > max} onClick={() => onChange(n)} className={item}>
            {t("times", { n })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={value === "all"}
          aria-label={all > 0 ? t("allCount", { n: all }) : undefined}
          disabled={all === 0}
          onClick={() => onChange("all")}
          className={item}
        >
          {t("all")}
        </button>
      </div>
    </fieldset>
  );
}
