import { describe, expect, it } from "vitest";
import { lotInputSchema } from "../../lib/economy/lots";
import { SETTING_DEFAULTS, SETTING_SCHEMAS } from "../../lib/settings/defaults";
import {
  ENNICHI_POOL_LOTS,
  ENNICHI_RANK_LOTS,
  ENNICHI_TIER_LOTS,
  REFERRAL_V2_GRAND_LOT,
  REFERRAL_V2_LOTS,
  REFERRAL_V2_MILESTONE_LOTS,
  REFERRAL_V2_STEP_LOTS,
} from "./referral-v2";

// Lots du parrainage v2 : les montants choisis le 2026-11-23 (docs/PLAN.md), et des réglages valides.

const byId = new Map(REFERRAL_V2_LOTS.map((l) => [l.id, l]));
const content = (id: string | null) => {
  const l = id ? byId.get(id) : undefined;
  return l ? { zeni: l.zeni, ...Object.fromEntries(l.boosters.map((b) => [b.slug, b.quantity])) } : null;
};

describe("lots du parrainage v2", () => {
  it("identifiants uniques, chacun cité par un réglage", () => {
    expect(byId.size).toBe(REFERRAL_V2_LOTS.length);
    const cited = new Set([
      ...REFERRAL_V2_STEP_LOTS.flat().filter(Boolean),
      ...Object.values(REFERRAL_V2_MILESTONE_LOTS),
      REFERRAL_V2_GRAND_LOT,
      ...ENNICHI_TIER_LOTS,
      ...Object.values(ENNICHI_RANK_LOTS),
      ...Object.values(ENNICHI_POOL_LOTS),
    ]);
    expect([...byId.keys()].sort()).toEqual([...cited].sort());
  });

  it("chaque ligne passe la validation des lots (sinon elle serait ignorée au versement)", () => {
    for (const l of REFERRAL_V2_LOTS) {
      const items = l.boosters.map((b) => ({ kind: "BOOSTER", boosterTypeId: `id-${b.slug}`, quantity: b.quantity }));
      expect(lotInputSchema.safeParse({ name: l.name, zeni: l.zeni, items, active: true }).success, l.id).toBe(true);
    }
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

  it("Ennichi : lots des lanternes choisis le 2026-11-23, banzuke et cagnotte", () => {
    expect(ENNICHI_TIER_LOTS.map(content)).toEqual([
      { zeni: 0, standard: 30, jubako: 2 },
      { zeni: 0, standard: 50, imperial: 2, mythique: 1 },
      { zeni: 0, standard: 80, mythique: 3, divin: 1 },
      { zeni: 0, standard: 250, divin: 3 },
    ]);
    expect(content(ENNICHI_RANK_LOTS[11])).toEqual({ zeni: 0, divin: 1 });
    expect(content(ENNICHI_POOL_LOTS[1])).toEqual({ zeni: 0, divin: 1 });
    expect(content(ENNICHI_POOL_LOTS[2])).toEqual({ zeni: 0, mythique: 1 });
  });

  it("les réglages que le seed écrit passent leur schéma", () => {
    const stepLots = REFERRAL_V2_STEP_LOTS.map(([referee, referrer, referrerTrust]) => ({ referee, referrer, referrerTrust }));
    expect(SETTING_SCHEMAS["referral.v2.stepLots"].safeParse(stepLots).success).toBe(true);
    const tiers = SETTING_DEFAULTS["ennichi.tiers"].map((t, i) => ({ ...t, lotId: ENNICHI_TIER_LOTS[i] }));
    expect(SETTING_SCHEMAS["ennichi.tiers"].safeParse(tiers).success).toBe(true);
    const pool = SETTING_DEFAULTS["ennichi.omikuji"].map((p, line) => ({ ...p, lotId: p.oneOfOne ? null : ENNICHI_POOL_LOTS[line] }));
    expect(SETTING_SCHEMAS["ennichi.omikuji"].safeParse(pool).success).toBe(true);
  });
});
