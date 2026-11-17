import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "./defaults";
import { CASINO_FORM_KEYS, casinoSettingsSchema } from "./casino-form";

const defaults = Object.fromEntries(CASINO_FORM_KEYS.map((k) => [k, SETTING_DEFAULTS[k]]));

describe("réglages du casino", () => {
  it("accepte les valeurs par défaut (sans date : teaser)", () => {
    expect(casinoSettingsSchema.safeParse(defaults).success).toBe(true);
    expect(defaults["casino.opensAt"]).toBeNull();
  });

  it("accepte une date d'ouverture ISO, refuse une date illisible", () => {
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.opensAt": "2026-12-01T19:00:00.000Z" }).success).toBe(true);
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.opensAt": "1er décembre" }).success).toBe(false);
  });

  it("exige au moins une rareté jouable et des bornes valides", () => {
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.coinflip.allowedRarities": [] }).success).toBe(false);
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.coinflip.maxOpenTables": 0 }).success).toBe(false);
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.coinflip.expiryHours": 24 * 8 }).success).toBe(false);
  });

  it("ne mélange pas l'interrupteur de visibilité au formulaire", () => {
    expect(CASINO_FORM_KEYS).not.toContain("features.casino" as never);
  });

  it("ignore une clé inconnue envoyée par le client", () => {
    expect(casinoSettingsSchema.safeParse({ ...defaults, "casino.autre": 1 }).success).toBe(true);
    expect(Object.keys(casinoSettingsSchema.parse({ ...defaults, "casino.autre": 1 }))).not.toContain("casino.autre");
  });
});
