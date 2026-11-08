import type { ThemesSetting } from "@/lib/showcase/themes";
import type { SettingKey } from "./defaults";
import { changedSettingKeys, settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/vitrines : nombre de vitrines par joueur, statut et condition de déblocage
// de chaque thème.

export const SHOWCASE_SETTING_KEYS = ["showcase.maxPerPlayer", "showcase.themes"] as const satisfies readonly SettingKey[];

export type ShowcaseSettingKey = (typeof SHOWCASE_SETTING_KEYS)[number];

export type ShowcaseSettings = SettingsOf<ShowcaseSettingKey>;

export const showcaseSettingsSchema = settingsSchemaFor(SHOWCASE_SETTING_KEYS);

export function changedShowcaseKeys(before: ShowcaseSettings, after: ShowcaseSettings): ShowcaseSettingKey[] {
  return changedSettingKeys(SHOWCASE_SETTING_KEYS, before, after);
}

/** Raretés citées par les conditions des thèmes (à vérifier contre le registre avant d'enregistrer). */
export function themeConditionRarities(themes: ThemesSetting): string[] {
  const rarities = Object.values(themes).flatMap(({ condition: c }) =>
    c.type === "RARITY_OWNED" ? [c.rarity] : c.type === "RARITIES_DISCOVERED" ? c.rarities : [],
  );
  return [...new Set(rarities)];
}

/** Thèmes tels qu'enregistrés : Sans décor reste toujours disponible et sans condition. */
export function normalizeThemes(themes: ThemesSetting): ThemesSetting {
  return { ...themes, none: { status: "AVAILABLE", condition: { type: "ALWAYS" } } };
}
