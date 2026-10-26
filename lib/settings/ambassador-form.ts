import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du rôle Ambassadeur, sur la page /admin/boosters.

export const AMBASSADOR_SETTING_KEYS = [
  "ambassador.maxStock",
  "ambassador.weeklyBoosters",
  "ambassador.weeklyBoosterSlug",
] as const satisfies readonly SettingKey[];

export type AmbassadorSettingKey = (typeof AMBASSADOR_SETTING_KEYS)[number];
export type AmbassadorSettings = SettingsOf<AmbassadorSettingKey>;

export const ambassadorSettingsSchema = settingsSchemaFor(AMBASSADOR_SETTING_KEYS);
