import type { SettingKey } from "./defaults";
import { changedSettingKeys, settingsSchemaFor, type SettingsOf } from "./form";

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
  "booster.apocalypseOdds",
  "booster.apocalypseWinRate",
  "booster.apocalypseKarma",
  "booster.apocalypseRuinFloors",
  "booster.apocalypseRuinCeiling",
  "booster.rotationHours",
  "booster.rotationDemographie",
  "booster.rotationGenre",
  "incense.cardStep",
  "incense.durationHours",
  "incense.rateBoost",
  "incense.boostFrom",
] as const satisfies readonly SettingKey[];

export type BoosterSettingKey = (typeof BOOSTER_SETTING_KEYS)[number];

export type BoosterSettings = SettingsOf<BoosterSettingKey>;

export const boosterSettingsSchema = settingsSchemaFor(BOOSTER_SETTING_KEYS);

/** Clés dont la valeur change (comparaison par valeur, ordre des clés d'objet compris). */
export function changedKeys(before: BoosterSettings, after: BoosterSettings): BoosterSettingKey[] {
  return changedSettingKeys(BOOSTER_SETTING_KEYS, before, after);
}
