import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/general : ceux qui n'appartiennent à aucun module (départ, fuseau, invités et leur durée de conservation,
// droits RGPD du joueur). La version exigée des CGU se change en publiant les CGU (/admin/legal). Le carrousel des gros
// tirages a son propre module (/admin/gros-tirages, pull-feed-form.ts).

export const GENERAL_SETTING_KEYS = [
  "economy.startingZeni",
  "game.timeZone",
  "guest.createPerHourPerIp",
  "guest.retentionDays",
  "account.deletionGraceDays",
  "account.usernameChangeDays",
  "account.exportsPerDay",
] as const satisfies readonly SettingKey[];

export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];
export type GeneralSettings = SettingsOf<GeneralSettingKey>;

export const generalSettingsSchema = settingsSchemaFor(GENERAL_SETTING_KEYS);
