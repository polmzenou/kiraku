import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/gros-tirages : carrousel « En direct · Gros tirages » de l'accueil.

export const PULL_FEED_SETTING_KEYS = [
  "home.pullFeed.enabled",
  "home.pullFeed.minRarity",
  "home.pullFeed.size",
  "home.pullFeed.maxPerPlayer",
  "home.pullFeed.maxAgeHours",
  "home.pullFeed.refreshSeconds",
  "home.pullFeed.cacheSeconds",
] as const satisfies readonly SettingKey[];

export type PullFeedSettingKey = (typeof PULL_FEED_SETTING_KEYS)[number];
export type PullFeedSettings = SettingsOf<PullFeedSettingKey>;

export const pullFeedSettingsSchema = settingsSchemaFor(PULL_FEED_SETTING_KEYS);
