import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages des badges de profil, sur la page /admin/cosmetiques.

export const PROFILE_SETTING_KEYS = ["profile.pioneerUntil", "profile.ambassadorReferrals"] as const satisfies readonly SettingKey[];

export type ProfileSettingKey = (typeof PROFILE_SETTING_KEYS)[number];
export type ProfileSettings = SettingsOf<ProfileSettingKey>;

export const profileSettingsSchema = settingsSchemaFor(PROFILE_SETTING_KEYS);
