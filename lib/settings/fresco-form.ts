import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/fresques : interrupteur des chutes, chance par booster et badge « Nouveau ».

export const FRESCO_SETTING_KEYS = ["fresco.enabled", "fresco.dropRate", "fresco.newHours"] as const satisfies readonly SettingKey[];

export type FrescoSettingKey = (typeof FRESCO_SETTING_KEYS)[number];
export type FrescoSettings = SettingsOf<FrescoSettingKey>;

export const frescoSettingsSchema = settingsSchemaFor(FRESCO_SETTING_KEYS);
