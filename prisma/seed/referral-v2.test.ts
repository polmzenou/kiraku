import { describe, expect, it } from "vitest";
import { SETTING_SCHEMAS } from "../../lib/settings/defaults";
import { REFERRAL_V2_GRAND_LOT, REFERRAL_V2_LOTS, REFERRAL_V2_MILESTONE_LOTS, REFERRAL_V2_STEP_LOTS } from "./referral-v2";

// Lots du parrainage v2 : les montants choisis le 2026-11-23 (docs/PLAN.md), et des réglages valides.

const byId = new Map(REFERRAL_V2_LOTS.map((l) => [l.id, l]));
const content = (id: string | null) => {
  const l = id ? byId.get(id) : undefined;
  return l ? { zeni: l.zeni, ...Object.fromEntries(l.boosters.map((b) => [b.slug, b.quantity])) } : null;
};

describe("lots du parrainage v2", () => {
  it("identifiants uniques, chacun cité par un réglage", () => {
    expect(byId.size).toBe(REFERRAL_V2_LOTS.length);
    const cited = new Set([...REFERRAL_V2_STEP_LOTS.flat().filter(Boolean), ...Object.values(REFERRAL_V2_MILESTONE_LOTS), REFERRAL_V2_GRAND_LOT]);
    expect([...byId.keys()].sort()).toEqual([...cited].sort());
  });

  it("étapes : filleul, parrain et part « confiance » tels que décidés", () => {
    const [e1, e2, e3, e4] = REFERRAL_V2_STEP_LOTS;
    expect(content(e1[0])).toEqual({ zeni: 0, standard: 20, jubako: 1 });
    expect(content(e1[1])).toEqual({ zeni: 0, standard: 5 });
    expect(content(e1[2])).toEqual({ zeni: 0, mythique: 1 });
    expect(content(e2[0])).toEqual({ zeni: 2_000, mythique: 2, standard: 10 });
    expect(content(e2[1])).toEqual({ zeni: 1_000, jubako: 2 });
    expect(content(e2[2])).toEqual({ zeni: 0, mythique: 1 });
    expect(content(e3[0])).toEqual({ zeni: 0, divin: 1, mythique: 1, standard: 10 });
    expect(content(e3[1])).toEqual({ zeni: 0, divin: 1, standard: 5 });
    expect(content(e4[0])).toEqual({ zeni: 0, divin: 2, mythique: 1 });
    expect(content(e4[1])).toEqual({ zeni: 0, divin: 2 });
  });

  it("paliers et grand-parrainage", () => {
    expect(content(REFERRAL_V2_MILESTONE_LOTS[3])).toEqual({ zeni: 0, divin: 1 });
    expect(content(REFERRAL_V2_MILESTONE_LOTS[10])).toEqual({ zeni: 0, mythique: 1, divin: 2 });
    expect(content(REFERRAL_V2_GRAND_LOT)).toEqual({ zeni: 0, imperial: 1, jubako: 1 });
  });

  it("les réglages que le seed écrit passent leur schéma", () => {
    const stepLots = REFERRAL_V2_STEP_LOTS.map(([referee, referrer, referrerTrust]) => ({ referee, referrer, referrerTrust }));
    expect(SETTING_SCHEMAS["referral.v2.stepLots"].safeParse(stepLots).success).toBe(true);
  });
});
