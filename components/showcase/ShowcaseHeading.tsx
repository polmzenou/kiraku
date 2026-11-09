import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";

/** Titre d'une vitrine : nom, nombre de cartes et disposition, pastille du thème, actions. */
export function ShowcaseHeading({
  name,
  count,
  layout,
  theme,
  actions,
}: {
  name: string;
  count: number;
  layout: ShowcaseLayoutId;
  theme: ShowcaseThemeId;
  actions?: ReactNode;
}) {
  const t = useTranslations("showcase");
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="break-words font-title text-2xl font-extrabold leading-tight md:text-3xl">{name}</h2>
        <p className="mt-1 text-xs text-text-muted md:text-sm">{t("meta", { count, layout: t(`layouts.${layout}.name`) })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {theme !== "none" && (
          <span className="vt-badge" data-vt-tone={theme}>
            <span aria-hidden="true" className="font-seal text-sm leading-none">
              {SHOWCASE_THEMES[theme].kanji}
            </span>
            {t(`themes.${theme}.name`)}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}
