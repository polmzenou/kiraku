"use client";

import { useTranslations } from "next-intl";
import { LAYOUT_IDS, SHOWCASE_LAYOUTS, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { LAYOUT_THUMBS, THUMB_FRAME } from "./layout-thumbs";

/** Miniature d'une disposition, comme sur la planche du design : cartes au format, vedettes en or. */
export function LayoutThumb({ layout }: { layout: ShowcaseLayoutId }) {
  return (
    <span aria-hidden="true" className="vt-thumb" data-fade={layout === "FRIEZE" || undefined}>
      {LAYOUT_THUMBS[layout].map(([x, y, w, h, hero, rotate, z], i) => (
        <span
          key={i}
          data-hero={hero ? "" : undefined}
          style={{
            left: `${(x / THUMB_FRAME.w) * 100}%`,
            top: `${(y / THUMB_FRAME.h) * 100}%`,
            width: `${(w / THUMB_FRAME.w) * 100}%`,
            height: `${(h / THUMB_FRAME.h) * 100}%`,
            transform: rotate ? `rotate(${rotate}deg)` : undefined,
            zIndex: z,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Choix d'une disposition (création, mode édition). `filled` : cartes en place ; une disposition plus
 * petite annonce combien sortiront de la vitrine.
 */
export function LayoutPicker({
  value,
  onChange,
  filled = 0,
  disabled = false,
}: {
  value: ShowcaseLayoutId;
  onChange: (layout: ShowcaseLayoutId) => void;
  filled?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("showcase");
  return (
    <div role="radiogroup" aria-label={t("layoutTitle")} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {LAYOUT_IDS.map((id) => {
        const checked = id === value;
        const capacity = SHOWCASE_LAYOUTS[id].capacity;
        const dropped = Math.max(0, filled - capacity);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(id)}
            title={t(`layouts.${id}.description`)}
            className={`flex min-h-11 flex-col gap-1.5 rounded-card border p-2 text-left transition-colors disabled:opacity-60 ${checked ? "border-shu bg-surface-2" : "border-border bg-surface hover:border-kin/60"}`}
          >
            <LayoutThumb layout={id} />
            <span className="flex items-baseline justify-between gap-1">
              <span className="truncate text-xs font-bold">{t(`layouts.${id}.name`)}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-text-muted">{id === "FRIEZE" ? t("capacityUpTo", { count: capacity }) : t("capacity", { count: capacity })}</span>
            </span>
            <span className="sr-only">{t(`layouts.${id}.description`)}</span>
            {dropped > 0 && !checked && <span className="text-[11px] leading-tight text-shu">{t("layoutDrops", { count: dropped })}</span>}
          </button>
        );
      })}
    </div>
  );
}
