import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "./defaults";
import { EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema } from "./event-gauge-form";

const defaults = Object.fromEntries(EVENT_GAUGE_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]]));

describe("réglages de la jauge", () => {
  it("couvre le 04/11/2026 19h au 10/11/2026 19h, heure de Paris", () => {
    const paris = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    expect(paris(SETTING_DEFAULTS["home.eventGauge.startsAt"])).toBe("04/11/2026 19:00");
    expect(paris(SETTING_DEFAULTS["home.eventGauge.endsAt"])).toBe("10/11/2026 19:00");
    expect(eventGaugeSettingsSchema.safeParse(defaults).success).toBe(true);
  });

  it("refuse une fin avant le début, une date invalide ou un objectif nul", () => {
    expect(eventGaugeSettingsSchema.safeParse({ ...defaults, "home.eventGauge.endsAt": defaults["home.eventGauge.startsAt"] }).success).toBe(false);
    expect(eventGaugeSettingsSchema.safeParse({ ...defaults, "home.eventGauge.startsAt": "demain" }).success).toBe(false);
    expect(eventGaugeSettingsSchema.safeParse({ ...defaults, "home.eventGauge.goal": 0 }).success).toBe(false);
  });
});
