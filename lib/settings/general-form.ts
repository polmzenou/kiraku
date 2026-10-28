import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/general : ceux qui n'appartiennent à aucun module (départ, fuseau, invités et leur durée de conservation,
// droits RGPD du joueur, carrousel des gros tirages de l'accueil). La version exigée des CGU se change en publiant les CGU (/admin/legal).

export const GENERAL_SETTING_KEYS = [
  "economy.startingZeni",
  "game.timeZone",
  "guest.createPerHourPerIp",
  "guest.retentionDays",
  "account.deletionGraceDays",
  "account.usernameChangeDays",
  "account.exportsPerDay",
  "home.pullFeed.enabled",
  "home.pullFeed.minRarity",
  "home.pullFeed.size",
  "home.pullFeed.maxAgeHours",
  "home.pullFeed.refreshSeconds",
  "home.pullFeed.cacheSeconds",
] as const satisfies readonly SettingKey[];

export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];
export type GeneralSettings = SettingsOf<GeneralSettingKey>;

export const generalSettingsSchema = settingsSchemaFor(GENERAL_SETTING_KEYS);
