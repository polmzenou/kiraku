import { BATTLE_SETTING_KEYS } from "@/lib/battle/config";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/combat : tous les battle.* (le moteur les fige au lancement de chaque partie).

export const COMBAT_SETTING_KEYS = BATTLE_SETTING_KEYS satisfies readonly SettingKey[];

export type CombatSettingKey = (typeof COMBAT_SETTING_KEYS)[number];

export type CombatSettings = SettingsOf<CombatSettingKey>;

export const combatSettingsSchema = settingsSchemaFor(COMBAT_SETTING_KEYS);
