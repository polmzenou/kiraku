"use client";

import { useTranslations } from "next-intl";
import { OPEN_COUNTS, type OpenCount } from "@/lib/boosters/catalog";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/** Sélecteur ×1 / ×5 / ×10 ; une quantité au-delà de `max` (stock ou Zeni) est désactivée. */
export function CountPicker({
  value,
  max,
  onChange,
}: {
  value: OpenCount;
  max: number;
  onChange: (count: OpenCount) => void;
}) {
  const t = useTranslations("opening");
  return (
    <fieldset className="flex flex-col items-center">
      <legend className="sr-only">{t("count")}</legend>
      <div className={segmentedTrackClass}>
        {OPEN_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            disabled={n > max}
            onClick={() => onChange(n)}
            className={`${segmentedItemClass} min-w-16 tabular-nums disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {t("times", { n })}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
