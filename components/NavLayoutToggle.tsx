"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { NAV_LAYOUTS, type NavLayout } from "@/lib/nav-layout";
import { applyNavLayout } from "@/lib/nav-layout-dom";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "./ui/Segmented";

/** Navigation desktop : menus groupés en haut ou barre latérale, sans recharger la page (comme le thème). */
export function NavLayoutToggle({ initial }: { initial: NavLayout }) {
  const t = useTranslations("nav.layout");
  const hint = useId();
  const [layout, setLayout] = useState<NavLayout>(initial);

  function choose(next: NavLayout) {
    setLayout(next);
    applyNavLayout(next);
  }

  return (
    // Sans effet sous 1024 px (capsule du bas) : le réglage n'apparaît que sur grand écran
    <fieldset className="hidden flex-col gap-2 lg:flex" aria-describedby={hint}>
      <legend className="mb-2 text-sm font-bold text-text-muted">{t("label")}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {NAV_LAYOUTS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={layout === value}
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
