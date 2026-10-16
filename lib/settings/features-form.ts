import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Interrupteurs de /admin/fonctionnalites : les clés existantes de chaque module, réunies sur une
// page (aucune clé en double : le module garde aussi son interrupteur).

export const FEATURE_SETTING_KEYS = [
  "features.casino",
  "shop.enabled",
  "shop.premiumEnabled",
  "market.enabled",
  "battle.enabled",
  "ranked.enabled",
  "social.enabled",
  "gifts.enabled",
  "missions.enabled",
  "referral.enabled",
  "notifications.pushEnabled",
] as const satisfies readonly SettingKey[];

export type FeatureSettingKey = (typeof FEATURE_SETTING_KEYS)[number];
export type FeatureSettings = SettingsOf<FeatureSettingKey>;

export const featureSettingsSchema = settingsSchemaFor(FEATURE_SETTING_KEYS);
