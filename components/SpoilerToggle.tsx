"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { SPOILER_MODES, type SpoilerMode } from "@/lib/spoiler";
import { applySpoilerMode } from "@/lib/spoiler-dom";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "./ui/Segmented";

/** Mode spoiler : floute l'illustration des cartes spoil, sans recharger la page (comme le thème). */
export function SpoilerToggle({ initial }: { initial: SpoilerMode }) {
  const t = useTranslations("spoiler");
  const hint = useId();
  const [mode, setMode] = useState<SpoilerMode>(initial);

  function choose(next: SpoilerMode) {
    setMode(next);
    applySpoilerMode(next);
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hint}>
      <legend className="mb-2 text-sm font-bold text-text-muted">{t("label")}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {SPOILER_MODES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => choose(value)}
            className={segmentedItemClass}
          >
            {t(value)}
          </button>
        ))}
      </div>
      <p id={hint} className="text-xs text-text-muted">
        {t("hint")}
      </p>
    </fieldset>
  );
}
