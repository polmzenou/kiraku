"use client";

import { useTranslations } from "next-intl";
import { SHOWCASE_THEMES, type ShowcaseThemeId, type ThemeChoice } from "@/lib/showcase/theme-registry";
import { conditionText } from "./condition-text";

/** Aperçu d'un thème : l'image fixe de son fond vidéo (rien pour Sans décor). */
export function ThemeThumb({ theme }: { theme: ShowcaseThemeId }) {
  const def = SHOWCASE_THEMES[theme];
  return (
    <span aria-hidden="true" className="vt-theme-thumb" data-vt-tone={theme}>
      {def.media && (
        // eslint-disable-next-line @next/next/no-img-element -- fichier public déjà dimensionné, sans optimisation
        <img src={def.media.mobile.still} alt="" loading="lazy" decoding="async" className="vt-theme-thumb-media" />
      )}
      <span className="vt-theme-thumb-kanji">{def.kanji}</span>
    </span>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-current">
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

/**
 * Choix d'un thème. Verrouillé : cadenas, condition et progression ; « Arrive prochainement » (réglé dans
 * l'admin) : aperçu flouté, cadenas, impossible à choisir. Les thèmes masqués ne sont pas proposés.
 * Le thème déjà posé reste choisissable même si sa condition n'est plus remplie.
 */
export function ThemePicker({
  choices,
  value,
  current,
  onChange,
  disabled = false,
}: {
  choices: readonly ThemeChoice[];
  value: ShowcaseThemeId;
  /** Thème déjà posé sur la vitrine (acquis). */
  current?: ShowcaseThemeId;
  onChange: (theme: ShowcaseThemeId) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("showcase");
  const tRarity = useTranslations("rarity");
  return (
    <div role="radiogroup" aria-label={t("themeTitle")} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {choices.map((choice) => {
        const { id } = choice;
        const owned = id === current;
        const soon = choice.state === "soon";
        const locked = choice.state === "locked" && !owned;
        const checked = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={soon || locked || undefined}
            disabled={disabled || soon || locked}
            onClick={() => onChange(id)}
            data-state={soon ? "soon" : locked ? "locked" : "available"}
            className={`vt-theme-option flex min-h-11 flex-col gap-1.5 rounded-card border p-2 text-left transition-colors ${checked ? "border-shu bg-surface-2" : "border-border bg-surface"} ${soon || locked ? "cursor-not-allowed" : "hover:border-kin/60"}`}
          >
            <span className="relative block overflow-hidden rounded-control">
              <ThemeThumb theme={id} />
              {(soon || locked) && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                  <LockIcon />
                </span>
              )}
            </span>
            <span className="truncate text-xs font-bold">{t(`themes.${id}.name`)}</span>
            {soon && <span className="text-[11px] font-bold leading-tight text-kin">{t("themeSoon")}</span>}
            {locked && choice.state === "locked" && (
              <span className="flex flex-col gap-0.5 text-[11px] leading-tight text-text-muted">
                <span>{conditionText(choice.condition, t as never, (key) => tRarity(key))}</span>
                {choice.goal > 1 && <span className="tabular-nums">{t("themeProgress", { current: choice.current, goal: choice.goal })}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
