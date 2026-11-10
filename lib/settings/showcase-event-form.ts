import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/evenement/vitrines : event vitrines (concours avec votes).

export const SHOWCASE_EVENT_SETTING_KEYS = [
  "event.showcase.enabled",
  "event.showcase.edition",
  "event.showcase.startsAt",
  "event.showcase.endsAt",
  "event.showcase.minCards",
  "event.showcase.pageSize",
] as const satisfies readonly SettingKey[];

export type ShowcaseEventSettingKey = (typeof SHOWCASE_EVENT_SETTING_KEYS)[number];
export type ShowcaseEventSettings = SettingsOf<ShowcaseEventSettingKey>;

export const showcaseEventSettingsSchema = settingsSchemaFor(SHOWCASE_EVENT_SETTING_KEYS).refine(
  (s) => Date.parse(s["event.showcase.startsAt"]) < Date.parse(s["event.showcase.endsAt"]),
  { message: "La fin doit suivre le début" },
);
