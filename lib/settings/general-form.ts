import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/general : ceux qui n'appartiennent à aucun module (départ, fuseau, invités,
// droits RGPD du joueur). La version exigée des CGU se change en publiant les CGU (/admin/legal).

export const GENERAL_SETTING_KEYS = [
  "economy.startingZeni",
  "game.timeZone",
  "guest.createPerHourPerIp",
  "account.deletionGraceDays",
  "account.usernameChangeDays",
  "account.exportsPerDay",
] as const satisfies readonly SettingKey[];

export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];
export type GeneralSettings = SettingsOf<GeneralSettingKey>;

export const generalSettingsSchema = settingsSchemaFor(GENERAL_SETTING_KEYS);
