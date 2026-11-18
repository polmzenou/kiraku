import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/expeditions : interrupteur (aussi sur /admin/fonctionnalites), offres par jour,
// attente après un abandon, bonus de chance par écart de palier, gains du triomphe et de l'échec.

export const EXPEDITION_SETTING_KEYS = [
  "expedition.enabled",
  "expedition.offersPerDay",
  "expedition.abandonCooldownHours",
  "expedition.cardBonus",
  "expedition.triumphRewardPct",
  "expedition.failRewardPct",
] as const satisfies readonly SettingKey[];

export type ExpeditionSettingKey = (typeof EXPEDITION_SETTING_KEYS)[number];
export type ExpeditionSettings = SettingsOf<ExpeditionSettingKey>;

export const expeditionSettingsSchema = settingsSchemaFor(EXPEDITION_SETTING_KEYS);
