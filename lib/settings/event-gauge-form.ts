import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/evenement : jauge communautaire de l'accueil.

export const EVENT_GAUGE_SETTING_KEYS = [
  "home.eventGauge.enabled",
  "home.eventGauge.startsAt",
  "home.eventGauge.endsAt",
  "home.eventGauge.goal",
  "home.eventGauge.refreshSeconds",
  "home.eventGauge.cacheSeconds",
] as const satisfies readonly SettingKey[];

export type EventGaugeSettingKey = (typeof EVENT_GAUGE_SETTING_KEYS)[number];
export type EventGaugeSettings = SettingsOf<EventGaugeSettingKey>;

export const eventGaugeSettingsSchema = settingsSchemaFor(EVENT_GAUGE_SETTING_KEYS).refine(
  (s) => Date.parse(s["home.eventGauge.startsAt"]) < Date.parse(s["home.eventGauge.endsAt"]),
  { message: "La fin doit suivre le début" },
);
