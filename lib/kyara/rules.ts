import { SETTING_DEFAULTS, type SettingValue } from "@/lib/settings/defaults";
import type { KyaraCode } from "./codes";
import { parseKyaraProfileUrl } from "./profile-url";

// Réglages de l'import Kyara lus dans GameSetting (valeurs par défaut dans lib/settings/defaults.ts).

export const KYARA_SETTING_KEYS = [
  "kyaraImport.enabled",
  "kyaraImport.launchAt",
  "kyaraImport.windowDays",
  "kyaraImport.staffProfileUrl",
  "kyaraImport.zeniByRarity",
  "kyaraImport.zeniCap",
  "kyaraImport.nonceMinutes",
  "kyaraImport.retentionDays",
] as const;

export type KyaraSettingKey = (typeof KYARA_SETTING_KEYS)[number];

export type KyaraRules = {
  enabled: boolean;
  /** Sortie en ms depuis l'époque ; null = pas encore de date (la page affiche « Bientôt »). */
  launchAt: number | null;
  windowDays: number;
  /** Profil Kyara du compte Kiraku que les joueurs ajoutent en ami ; null tant qu'il n'est pas réglé. */
  staffKyaraUserId: string | null;
  zeniByCode: Readonly<Record<KyaraCode, number>>;
  zeniCap: number;
  nonceMinutes: number;
  retentionDays: number;
};

/** Date ISO du réglage → instant, ou null si vide ou illisible. */
export function parseInstant(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

export function kyaraRulesFrom(get: <K extends KyaraSettingKey>(key: K) => SettingValue<K>): KyaraRules {
  const staffUrl = get("kyaraImport.staffProfileUrl");
  return {
    enabled: get("kyaraImport.enabled"),
    launchAt: parseInstant(get("kyaraImport.launchAt")),
    windowDays: get("kyaraImport.windowDays"),
    staffKyaraUserId: staffUrl === null ? null : parseKyaraProfileUrl(staffUrl),
    zeniByCode: get("kyaraImport.zeniByRarity"),
    zeniCap: get("kyaraImport.zeniCap"),
    nonceMinutes: get("kyaraImport.nonceMinutes"),
    retentionDays: get("kyaraImport.retentionDays"),
  };
}

export const DEFAULT_KYARA_RULES: KyaraRules = kyaraRulesFrom((key) => SETTING_DEFAULTS[key]);
