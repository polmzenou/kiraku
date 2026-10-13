"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { THEMES, type Theme } from "@/lib/theme";
import { applyTheme } from "@/lib/theme-dom";

export function ThemeToggle({ initial }: { initial: Theme }) {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-text-muted">{t("label")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => choose(value)}
            className="min-h-11 rounded-button border border-border bg-surface-2 px-3 text-sm aria-pressed:border-shu aria-pressed:text-shu"
          >
            {t(value)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
