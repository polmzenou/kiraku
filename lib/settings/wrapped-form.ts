import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/wrapped : récap personnel de l'année (lib/wrapped).

export const WRAPPED_SETTING_KEYS = ["wrapped.enabled", "wrapped.year", "wrapped.opensAt", "wrapped.closesAt"] as const satisfies readonly SettingKey[];

export type WrappedSettingKey = (typeof WRAPPED_SETTING_KEYS)[number];
export type WrappedSettings = SettingsOf<WrappedSettingKey>;

export const wrappedSettingsSchema = settingsSchemaFor(WRAPPED_SETTING_KEYS).refine(
  (s) => Date.parse(s["wrapped.opensAt"]) < Date.parse(s["wrapped.closesAt"]),
  { message: "La fermeture doit suivre l'ouverture" },
);
