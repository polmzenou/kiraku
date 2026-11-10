import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "./defaults";
import { SHOWCASE_EVENT_SETTING_KEYS, showcaseEventSettingsSchema } from "./showcase-event-form";

const defaults = Object.fromEntries(SHOWCASE_EVENT_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]]));

describe("réglages de l'event vitrines", () => {
  it("caché par défaut, sur une fenêtre valide", () => {
    expect(SETTING_DEFAULTS["event.showcase.enabled"]).toBe(false);
    expect(showcaseEventSettingsSchema.safeParse(defaults).success).toBe(true);
  });

  it("refuse une fin avant le début, une édition mal formée et des bornes hors limites", () => {
    expect(showcaseEventSettingsSchema.safeParse({ ...defaults, "event.showcase.endsAt": defaults["event.showcase.startsAt"] }).success).toBe(false);
    for (const edition of ["", "Vitrines 1", "vitrines_1", "x".repeat(41)]) {
      expect(showcaseEventSettingsSchema.safeParse({ ...defaults, "event.showcase.edition": edition }).success).toBe(false);
    }
    expect(showcaseEventSettingsSchema.safeParse({ ...defaults, "event.showcase.minCards": 0 }).success).toBe(false);
    expect(showcaseEventSettingsSchema.safeParse({ ...defaults, "event.showcase.pageSize": 3 }).success).toBe(false);
  });
});
