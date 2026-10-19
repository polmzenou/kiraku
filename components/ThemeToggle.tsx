"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { THEMES, type Theme } from "@/lib/theme";
import { applyTheme } from "@/lib/theme-dom";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "./ui/Segmented";

export function ThemeToggle({ initial }: { initial: Theme }) {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold text-text-muted">{t("label")}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {THEMES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => choose(value)}
            className={segmentedItemClass}
          >
            {t(value)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
