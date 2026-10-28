import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du suivi de consommation du serveur (/admin/general) : seuils du bandeau d'alerte de /admin.

export const USAGE_SETTING_KEYS = ["usage.alertThresholds"] as const satisfies readonly SettingKey[];

export type UsageSettingKey = (typeof USAGE_SETTING_KEYS)[number];
export type UsageSettings = SettingsOf<UsageSettingKey>;

export const usageSettingsSchema = settingsSchemaFor(USAGE_SETTING_KEYS);
