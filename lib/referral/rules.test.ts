import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS, SETTING_SCHEMAS } from "@/lib/settings/defaults";
import { DEFAULT_REFERRAL_V2_RULES, referralV2RulesFrom, type ReferralV2SettingKey } from "./rules";

describe("règles du parrainage v2", () => {
  it("coupé par défaut, avec les conditions décidées", () => {
    expect(DEFAULT_REFERRAL_V2_RULES).toMatchObject({
      enabled: false,
      maxPerMonth: 30,
      installHours: 48,
      installOpenings: 20,
      accroDays: 5,
      accroWindowDays: 14,
      fideleDays: 15,
      fideleWindowDays: 30,
      trustDiscordDays: 30,
      holdScore: 60,
      cardLockDays: 14,
      pairLockDays: 30,
    });
    expect(DEFAULT_REFERRAL_V2_RULES.milestones.map((m) => m.installed)).toEqual([1, 3, 5, 10, 25, 50, 100]);
  });

  it("une fenêtre ne demande jamais plus de jours qu'elle n'en contient", () => {
    const rules = referralV2RulesFrom(<K extends ReferralV2SettingKey>(key: K) =>
      (key === "referral.v2.accroDays" ? 20 : SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K],
    );
    expect(rules.accroDays).toBe(14);
  });

  it("la part « confiance » ne vaut que pour les étapes 1 et 2", () => {
    const lots = SETTING_DEFAULTS["referral.v2.stepLots"].map((s, i) => (i === 2 ? { ...s, referrerTrust: "lot-x" } : s));
    expect(SETTING_SCHEMAS["referral.v2.stepLots"].safeParse(lots).success).toBe(false);
    expect(SETTING_SCHEMAS["referral.v2.stepLots"].safeParse(SETTING_DEFAULTS["referral.v2.stepLots"].slice(0, 3)).success).toBe(false);
  });

  it("les paliers montent strictement", () => {
    const ms = [...SETTING_DEFAULTS["referral.v2.milestones"]];
    expect(SETTING_SCHEMAS["referral.v2.milestones"].safeParse([ms[1], ms[0]]).success).toBe(false);
  });
});
