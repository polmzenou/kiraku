import { SETTING_DEFAULTS, type SettingValue } from "@/lib/settings/defaults";
import type { EngineRules } from "./types";

// Réglages du combat lus dans GameSetting (valeurs par défaut dans lib/settings/defaults.ts).

export const BATTLE_SETTING_KEYS = [
  "battle.enabled",
  "battle.stats",
  "battle.damage",
  "battle.orbs",
  "battle.firstTurnActions",
  "battle.keywordsByRarity",
  "battle.keywordValues",
  "battle.techniques",
  "battle.turnSeconds",
  "battle.maxMissedTurns",
  "battle.maxTurns",
  "battle.queueSeconds",
  "battle.roomMinutes",
  "battle.botMistakePct",
  "battle.botUpgradePct",
  "battle.rewards",
  "battle.pollSeconds",
  "battle.safetyPollSeconds",
  "battle.queuePollSeconds",
  "battle.lobbyPollSeconds",
] as const;

export type BattleSettingKey = (typeof BATTLE_SETTING_KEYS)[number];

export type BattleRules = {
  enabled: boolean;
  stats: SettingValue<"battle.stats">;
  damage: SettingValue<"battle.damage">;
  orbs: SettingValue<"battle.orbs">;
  firstTurnActions: number;
  keywordsByRarity: SettingValue<"battle.keywordsByRarity">;
  keywordValues: SettingValue<"battle.keywordValues">;
  techniques: SettingValue<"battle.techniques">;
  turnSeconds: number;
  maxMissedTurns: number;
  maxTurns: number;
  queueSeconds: number;
  roomMinutes: number;
  botMistakePct: number;
  botUpgradePct: number;
  rewards: SettingValue<"battle.rewards">;
  pollSeconds: number;
  safetyPollSeconds: number;
  queuePollSeconds: number;
  lobbyPollSeconds: number;
};

export function battleRulesFrom(get: <K extends BattleSettingKey>(key: K) => SettingValue<K>): BattleRules {
  return {
    enabled: get("battle.enabled"),
    stats: get("battle.stats"),
    damage: get("battle.damage"),
    orbs: get("battle.orbs"),
    firstTurnActions: get("battle.firstTurnActions"),
    keywordsByRarity: get("battle.keywordsByRarity"),
    keywordValues: get("battle.keywordValues"),
    techniques: get("battle.techniques"),
    turnSeconds: get("battle.turnSeconds"),
    maxMissedTurns: get("battle.maxMissedTurns"),
    maxTurns: get("battle.maxTurns"),
    queueSeconds: get("battle.queueSeconds"),
    roomMinutes: get("battle.roomMinutes"),
    botMistakePct: get("battle.botMistakePct"),
    botUpgradePct: get("battle.botUpgradePct"),
    rewards: get("battle.rewards"),
    pollSeconds: get("battle.pollSeconds"),
    safetyPollSeconds: get("battle.safetyPollSeconds"),
    queuePollSeconds: get("battle.queuePollSeconds"),
    lobbyPollSeconds: get("battle.lobbyPollSeconds"),
  };
}

export const DEFAULT_BATTLE_RULES: BattleRules = battleRulesFrom((key) => SETTING_DEFAULTS[key]);

/** Partie des réglages qui gouverne le moteur, figée dans le setup au lancement. */
export function engineRules(r: BattleRules): EngineRules {
  return {
    damage: { ...r.damage },
    orbs: { ...r.orbs },
    firstTurnActions: r.firstTurnActions,
    maxTurns: r.maxTurns,
    maxMissedTurns: r.maxMissedTurns,
    keywords: { ...r.keywordValues },
    techniques: structuredClone(r.techniques),
  };
}
