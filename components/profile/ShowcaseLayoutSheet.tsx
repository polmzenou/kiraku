"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { isHero, LAYOUT_SLOTS, SHOWCASE_LAYOUTS, type ShowcaseLayout } from "@/lib/collection/showcase-layouts";
import { Sheet } from "../ui/Sheet";
import { layoutStyle } from "./showcase-layout-style";
import "./ShowcaseLayout.css";

// Miniatures serrées : mêmes zones que la vraie vitrine, écarts réduits
const thumbGaps = { "--gap-x": "3px", "--gap-y": "4px", "--gap-x-d": "3px", "--gap-y-d": "4px" } as CSSProperties;

/** Miniature d'une disposition : les 8 cases numérotées, vedettes en or. Elle suit l'écran (mobile ou ordinateur). */
function LayoutThumb({ layout }: { layout: ShowcaseLayout }) {
  const grid = layout === "GRID";
  // Des <span> : la miniature vit dans un <button>, qui n'accepte pas de liste
  return (
    <span
      aria-hidden="true"
      className={grid ? "grid w-full grid-cols-2 gap-[3px] md:grid-cols-4" : "showcase-layout"}
      style={grid ? undefined : { ...layoutStyle(layout), ...thumbGaps }}
    >
      {Array.from({ length: LAYOUT_SLOTS }, (_, i) => (
        <span
          key={i}
          data-slot={i + 1}
          data-hero={isHero(layout, i) || undefined}
          className={`flex aspect-[5/7] items-center justify-center rounded-[3px] border text-[10px] font-bold tabular-nums ${
            isHero(layout, i) ? "border-kin bg-kin/25 text-kin" : "border-border bg-surface-2 text-text-muted"
          }`}
        >
          {i + 1}
        </span>
      ))}
    </span>
  );
}

/** Choix de la disposition de la vitrine (mode Modifier) : une tuile par disposition, celle en place cochée. */
export function ShowcaseLayoutSheet({
  current,
  onChoose,
  onClose,
}: {
  current: ShowcaseLayout;
  onChoose: (layout: ShowcaseLayout) => void;
  onClose: () => void;
}) {
  const t = useTranslations("showcase");
  return (
    <Sheet open onClose={onClose} title={t("layoutTitle")} wide>
      <p className="text-sm text-text-muted">{t("layoutHint")}</p>
      <div role="radiogroup" aria-label={t("layoutTitle")} className="grid grid-cols-2 gap-3 md:gap-4">
        {SHOWCASE_LAYOUTS.map((layout) => {
          const checked = layout === current;
          return (
            <button
              key={layout}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChoose(layout)}
              className={`flex min-h-11 min-w-0 flex-col gap-2 rounded-card border-2 bg-surface p-2.5 text-left transition-colors md:p-3 ${
                checked ? "border-shu" : "border-border hover:border-text-muted/50"
              }`}
            >
              <span className="flex min-h-24 w-full items-center">
                <LayoutThumb layout={layout} />
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-bold">{t(`layouts.${layout}.name`)}</span>
                {checked && (
                  <span aria-hidden="true" className="text-shu">
                    ✓
                  </span>
                )}
              </span>
              <span className="text-xs text-text-muted">{t(`layouts.${layout}.description`)}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
