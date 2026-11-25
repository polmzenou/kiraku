import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages des succès, sur la page /admin/succes : interrupteur, seuils réglés et succès désactivés.

export const ACHIEVEMENT_SETTING_KEYS = [
  "achievements.enabled",
  "achievements.goals",
  "achievements.disabled",
] as const satisfies readonly SettingKey[];

export type AchievementSettingKey = (typeof ACHIEVEMENT_SETTING_KEYS)[number];
export type AchievementSettingsForm = SettingsOf<AchievementSettingKey>;

export const achievementSettingsSchema = settingsSchemaFor(ACHIEVEMENT_SETTING_KEYS);
