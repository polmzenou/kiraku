import { SEAL_GLYPHS } from "../seal-glyphs";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/prestige : interrupteur (aussi sur /admin/fonctionnalites), accès par rareté, héritières,
// délai, garde de taille, héritage et consécration, barème des Zeni, éditions gravées.

export const PRESTIGE_SETTING_KEYS = [
  "prestige.enabled",
  "prestige.staffLiveWhenDisabled",
  "prestige.requiredPercent",
  "prestige.keepSlots",
  "prestige.minDaysBetween",
  "prestige.maxCopies",
  "prestige.heritageMax",
  "prestige.consecrateMinOwnCycles",
  "prestige.zeniTiers",
  "prestige.zeniCap",
  "prestige.printing.minPrestige",
  "prestige.printing.chanceBp",
  "prestige.printing.sizes",
  "prestige.printing.current",
  "prestige.printing.seals",
  "prestige.printing.recycleMultiplier",
  "prestige.riteStyle",
  "prestige.rebirthBoosterSlug",
  "prestige.rebirthBoosters",
] as const satisfies readonly SettingKey[];

export type PrestigeSettingKey = (typeof PRESTIGE_SETTING_KEYS)[number];
export type PrestigeSettings = SettingsOf<PrestigeSettingKey>;

/** Un sceau de tirage ne s'écrit qu'avec les kanji de la police des sceaux (sinon il sortirait dans une police de secours). */
export function sealsInFont(seals: Readonly<Record<string, string>>, glyphs: string): boolean {
  return Object.values(seals).every((seal) => [...seal].every((c) => glyphs.includes(c)));
}

export const prestigeSettingsSchema = settingsSchemaFor(PRESTIGE_SETTING_KEYS).refine((s) => sealsInFont(s["prestige.printing.seals"], SEAL_GLYPHS), {
  message: "Sceau hors de la police des sceaux",
});
