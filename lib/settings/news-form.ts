import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/nouveautes : l'encart « Nouveautés » en haut de l'accueil.

export const NEWS_SETTING_KEYS = ["home.news"] as const satisfies readonly SettingKey[];

export type NewsSettingKey = (typeof NEWS_SETTING_KEYS)[number];
export type NewsSettings = SettingsOf<NewsSettingKey>;

export const newsSettingsSchema = settingsSchemaFor(NEWS_SETTING_KEYS);
