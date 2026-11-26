import { SETTING_DEFAULTS, type SettingValue } from "@/lib/settings/defaults";

// Réglages du casino lus dans GameSetting (valeurs par défaut dans lib/settings/defaults.ts).

export const CASINO_SETTING_KEYS = [
  "features.casino",
  "casino.opensAt",
  "casino.newBadgeDays",
  "casino.minAccountAgeHours",
  "casino.coinflip.enabled",
  "casino.coinflip.expiryHours",
  "casino.coinflip.maxOpenTables",
  "casino.coinflip.dailyLimit",
  "casino.coinflip.allowedRarities",
  "casino.coinflip.lastCopyAllowed",
  "casino.coinflip.lobbyPollSeconds",
  "casino.coinflip.tablePollSeconds",
  "casino.coinflip.feedSize",
  "casino.coinflip.feedMaxAgeHours",
  "casino.coinflip.feedBigFrom",
] as const;

export type CasinoSettingKey = (typeof CASINO_SETTING_KEYS)[number];

export type CoinFlipRules = {
  enabled: boolean;
  expiryHours: number;
  maxOpenTables: number;
  dailyLimit: number;
  allowedRarities: readonly string[];
  lastCopyAllowed: boolean;
  lobbyPollSeconds: number;
  tablePollSeconds: number;
  feedSize: number;
  feedMaxAgeHours: number;
  /** Lancers mis en avant dans le fil du hall : pot d'au moins cette rareté. */
  feedBigFrom: string;
};

export type CasinoRules = {
  /** Interrupteur features.casino : éteint, le casino disparaît pour les joueurs. */
  visible: boolean;
  /** Ouverture en ms depuis l'époque ; null = pas encore de date (teaser sans compte à rebours). */
  opensAt: number | null;
  newBadgeDays: number;
  minAccountAgeHours: number;
  coinflip: CoinFlipRules;
};

/** Date ISO du réglage → instant, ou null si vide ou illisible. */
export function parseOpensAt(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

export function casinoRulesFrom(get: <K extends CasinoSettingKey>(key: K) => SettingValue<K>): CasinoRules {
  return {
    visible: get("features.casino"),
    opensAt: parseOpensAt(get("casino.opensAt")),
    newBadgeDays: get("casino.newBadgeDays"),
    minAccountAgeHours: get("casino.minAccountAgeHours"),
    coinflip: {
      enabled: get("casino.coinflip.enabled"),
      expiryHours: get("casino.coinflip.expiryHours"),
      maxOpenTables: get("casino.coinflip.maxOpenTables"),
      dailyLimit: get("casino.coinflip.dailyLimit"),
      allowedRarities: get("casino.coinflip.allowedRarities"),
      lastCopyAllowed: get("casino.coinflip.lastCopyAllowed"),
      lobbyPollSeconds: get("casino.coinflip.lobbyPollSeconds"),
      tablePollSeconds: get("casino.coinflip.tablePollSeconds"),
      feedSize: get("casino.coinflip.feedSize"),
      feedMaxAgeHours: get("casino.coinflip.feedMaxAgeHours"),
      feedBigFrom: get("casino.coinflip.feedBigFrom"),
    },
  };
}

export const DEFAULT_CASINO_RULES: CasinoRules = casinoRulesFrom((key) => SETTING_DEFAULTS[key]);
