"use client";

import { useTranslations } from "next-intl";
import { OPEN_COUNTS, type OpenCount } from "@/lib/boosters/catalog";

/** Sélecteur ×1 / ×5 / ×10 ; une quantité au-delà du stock est désactivée. */
export function CountPicker({
  value,
  stock,
  onChange,
}: {
  value: OpenCount;
  stock: number;
  onChange: (count: OpenCount) => void;
}) {
  const t = useTranslations("opening");
  return (
    <fieldset className="flex flex-col items-center gap-2">
      <legend className="sr-only">{t("count")}</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPEN_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            disabled={n > stock}
            onClick={() => onChange(n)}
            className="min-h-11 min-w-16 rounded-button border border-border bg-surface-2 px-3 text-sm font-bold tabular-nums disabled:opacity-40 aria-pressed:border-shu aria-pressed:text-shu"
          >
            {t("times", { n })}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
