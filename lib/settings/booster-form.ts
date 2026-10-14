import { z } from "zod";
import { SETTING_SCHEMAS, type SettingKey, type SettingValue } from "./defaults";

// Réglages du panneau /admin/boosters : chaque clé garde son propre schéma Zod (defaults.ts).

export const BOOSTER_SETTING_KEYS = [
  "booster.intervalMinutes",
  "booster.maxStock",
  "booster.slotFloors",
  "booster.rates",
  "booster.pityThreshold",
  "booster.goldenEvery",
  "booster.goldenFloor",
  "booster.divineOdds",
] as const satisfies readonly SettingKey[];

export type BoosterSettingKey = (typeof BOOSTER_SETTING_KEYS)[number];

export type BoosterSettings = { [K in BoosterSettingKey]: SettingValue<K> };

export const boosterSettingsSchema = z.object(
  Object.fromEntries(BOOSTER_SETTING_KEYS.map((k) => [k, SETTING_SCHEMAS[k]])) as {
    [K in BoosterSettingKey]: (typeof SETTING_SCHEMAS)[K];
  },
);

/** Clés dont la valeur change (comparaison par valeur, ordre des clés d'objet compris). */
export function changedKeys(before: BoosterSettings, after: BoosterSettings): BoosterSettingKey[] {
  return BOOSTER_SETTING_KEYS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}
