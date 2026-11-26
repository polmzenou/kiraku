import { BATTLE_SETTING_KEYS } from "@/lib/battle/config";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/combat : les battle.* (le moteur les fige au lancement de chaque partie), sauf
// battle.ultimateRarities, que l'éditeur des raretés tient : ce formulaire ne l'affiche pas, et le renvoyer
// tel qu'il était à l'ouverture de la page écrasait en silence ce que l'éditeur avait changé entre-temps.

type CombatKey = Exclude<(typeof BATTLE_SETTING_KEYS)[number], "battle.ultimateRarities">;

export const COMBAT_SETTING_KEYS = BATTLE_SETTING_KEYS.filter((k): k is CombatKey => k !== "battle.ultimateRarities") satisfies readonly SettingKey[];

export type CombatSettingKey = (typeof COMBAT_SETTING_KEYS)[number];

export type CombatSettings = SettingsOf<CombatSettingKey>;

export const combatSettingsSchema = settingsSchemaFor(COMBAT_SETTING_KEYS);
