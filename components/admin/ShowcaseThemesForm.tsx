"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ProfileCondition } from "@/lib/profile/conditions";
import { changedShowcaseKeys, showcaseSettingsSchema, type ShowcaseSettingKey, type ShowcaseSettings } from "@/lib/settings/showcase-form";
import { DEFAULT_THEME, SHOWCASE_THEMES, THEME_IDS, THEME_STATUSES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import { themeConfig, type ThemeConfig } from "@/lib/showcase/themes";
import { updateShowcaseSettings } from "@/server/actions/admin-settings";
import { ConditionFields } from "./ConditionFields";
import { NumberField, SelectField } from "./fields";
import { SettingsSaveBar, useSettingsDraft } from "./SettingsSaveBar";

const LABEL_KEY = {
  "showcase.maxPerPlayer": "maxPerPlayer",
  "showcase.themes": "themes",
} as const satisfies Record<ShowcaseSettingKey, string>;

/** Aperçu d'un thème : la vignette de son fond vidéo, sinon son kanji. */
function ThemePreview({ id }: { id: ShowcaseThemeId }) {
  const media = SHOWCASE_THEMES[id].media;
  if (media) {
    return (
      <Image
        src={media.thumb}
        alt=""
        width={60}
        height={80}
        unoptimized
        className="h-20 w-15 shrink-0 rounded-control border border-border object-cover"
      />
    );
  }
  return (
    <span aria-hidden="true" lang="ja" className="flex h-20 w-15 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 font-seal text-3xl">
      {SHOWCASE_THEMES[id].kanji}
    </span>
  );
}

/**
 * Vitrines : nombre maximal par joueur, puis statut (disponible, arrive prochainement, masqué) et
 * condition de déblocage de chaque thème. Sans décor reste toujours disponible et libre.
 */
export function ShowcaseThemesForm({
  initial,
  usage,
  seriesTitles,
}: {
  initial: ShowcaseSettings;
  /** Vitrines qui utilisent chaque thème. */
  usage: Record<string, number>;
  /** Titres des séries déjà citées par une condition « série complétée ». */
  seriesTitles: Record<string, string>;
}) {
  const t = useTranslations("admin.showcases");
  // Valeurs en vigueur telles quelles (un thème jamais réglé s'affiche avec son défaut, themeConfig) : la base
  // envoyée au serveur est celle de la base de données, comparée sans faux conflit
  const { draft, base, setDraft, saved } = useSettingsDraft(initial);
  const valid = showcaseSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedShowcaseKeys(base, draft) : [];
  const themes = draft["showcase.themes"];

  const setTheme = (id: ShowcaseThemeId, config: ThemeConfig) =>
    setDraft((d) => ({ ...d, "showcase.themes": { ...d["showcase.themes"], [id]: config } }));

  const seriesTitleOf = (condition: ProfileCondition) =>
    condition.type === "SERIES_COMPLETE" ? (seriesTitles[condition.seriesId] ?? null) : null;

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex max-w-2xl min-w-0 flex-col gap-3 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("limitsSection")}</legend>
        <NumberField
          label={t("maxPerPlayer")}
          hint={t("maxPerPlayerHint")}
          value={draft["showcase.maxPerPlayer"]}
          min={1}
          max={20}
          onChange={(v) => setDraft((d) => ({ ...d, "showcase.maxPerPlayer": v }))}
        />
      </fieldset>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-title text-lg font-bold">{t("themesSection")}</h3>
          <p className="max-w-prose text-sm text-text-muted">{t("themesHint")}</p>
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {THEME_IDS.map((id) => {
            const config = themes[id] ?? themeConfig(themes, id);
            const locked = id === DEFAULT_THEME;
            return (
              <li key={id} className="flex min-w-0 flex-col gap-3 lacquer rounded-card p-4">
                <div className="flex items-center gap-3">
                  <ThemePreview id={id} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <h4 className="font-title text-lg font-bold">{t(`themes.${id}`)}</h4>
                    <p className="text-xs text-text-muted">{t("usage", { count: usage[id] ?? 0 })}</p>
                  </div>
                </div>
                {locked ? (
                  <p className="text-sm text-text-muted">{t("noneLocked")}</p>
                ) : (
                  <>
                    <SelectField
                      label={t("status")}
                      value={config.status}
                      options={THEME_STATUSES.map((status) => ({ value: status, label: t(`statuses.${status}`) }))}
                      hint={t(`statusHints.${config.status}`)}
                      onChange={(status) => setTheme(id, { ...config, status })}
                    />
                    <ConditionFields
                      value={config.condition}
                      onChange={(condition) => setTheme(id, { ...config, condition })}
                      seriesTitle={seriesTitleOf(config.condition)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <SettingsSaveBar valid={valid} changedLabels={changed.map((k) => t(`keys.${LABEL_KEY[k]}`))} base={base} draft={draft} saved={saved} save={updateShowcaseSettings} />
    </form>
  );
}
