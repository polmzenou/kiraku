import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/economie : interrupteurs des missions et de la boutique, parrainage.

export const ECONOMY_SETTING_KEYS = [
  "missions.enabled",
  "shop.enabled",
  "shop.premiumEnabled",
  "referral.enabled",
  "referral.attachWindowDays",
  "referral.maxPerMonth",
  "referral.minAccountAgeHours",
  "referral.minBoostersOpened",
  "referral.requireVerified",
  "referral.referrerLotId",
  "referral.refereeLotId",
  "referral.milestones",
] as const satisfies readonly SettingKey[];

export type EconomySettingKey = (typeof ECONOMY_SETTING_KEYS)[number];

export type EconomySettings = SettingsOf<EconomySettingKey>;

export const economySettingsSchema = settingsSchemaFor(ECONOMY_SETTING_KEYS);
