import { RANKED_SETTING_KEYS } from "@/lib/ranked/rules";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/classe : rangs, barème, appariement, saisons et lots de fin de saison.

export const RANKED_FORM_KEYS = RANKED_SETTING_KEYS satisfies readonly SettingKey[];

export type RankedSettingKey = (typeof RANKED_FORM_KEYS)[number];

export type RankedSettings = SettingsOf<RankedSettingKey>;

// Grand Champion au-dessus du dernier rang, écart d'appariement maximum ≥ écart de départ
export const rankedSettingsSchema = settingsSchemaFor(RANKED_FORM_KEYS).refine(
  (s) => s["ranked.grandChampion"].min > s["ranked.tiers"].CHAMPION.min && s["ranked.matchRange"].max >= s["ranked.matchRange"].base,
  { message: "Grand Champion sous Champion, ou écart maximum sous l'écart de départ" },
);
