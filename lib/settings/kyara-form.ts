import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/kyara (import Kyara, étape 17). L'interrupteur est aussi sur /admin/fonctionnalites.

export const KYARA_FORM_KEYS = [
  "kyaraImport.enabled",
  "kyaraImport.launchAt",
  "kyaraImport.windowDays",
  "kyaraImport.staffProfileUrl",
  "kyaraImport.zeniByRarity",
  "kyaraImport.zeniCap",
  "kyaraImport.retentionDays",
] as const satisfies readonly SettingKey[];

export type KyaraFormKey = (typeof KYARA_FORM_KEYS)[number];
export type KyaraSettings = SettingsOf<KyaraFormKey>;

export const kyaraSettingsSchema = settingsSchemaFor(KYARA_FORM_KEYS);
