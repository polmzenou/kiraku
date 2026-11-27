import { describe, expect, it } from "vitest";
import { planPayouts, stepMultiplier, type PayoutInput } from "./payout";
import { DEFAULT_REFERRAL_V2_RULES, type ReferralV2Rules } from "./rules";
import type { StepTimes } from "./steps";

const at = new Date("2026-11-25T12:00:00Z");
const RULES: ReferralV2Rules = {
  ...DEFAULT_REFERRAL_V2_RULES,
  stepLots: [
    { referee: "l1-ref", referrer: "l1-par", referrerTrust: "l1-trust" },
    { referee: "l2-ref", referrer: "l2-par", referrerTrust: "l2-trust" },
    { referee: "l3-ref", referrer: "l3-par", referrerTrust: null },
    { referee: "l4-ref", referrer: null, referrerTrust: null },
  ],
  grandLotId: "grand",
  milestones: DEFAULT_REFERRAL_V2_RULES.milestones.map((m) => (m.installed === 3 ? { ...m, lotId: "palier-3" } : m)),
};
const times = (n: number): StepTimes => [0, 1, 2, 3].map((i) => (i < n ? at : null)) as unknown as StepTimes;
const input = (over: Partial<PayoutInput> = {}, referral: Partial<PayoutInput["referral"]> = {}): PayoutInput => ({
  referral: { referrerId: "par", refereeId: "lea", grandReferrerId: null, ennichiMultiplier: null, times: times(1), trust: "HIGH", ...referral },
  paid: [],
  paidMilestones: [],
  installed: 0,
  grandAllowed: true,
  ...over,
});
const keys = (due: ReturnType<typeof planPayouts>) => due.map((d) => `${d.kind}:${d.side ?? "-"}:${d.step ?? d.milestone?.installed ?? "-"}:${d.userId}`);

describe("ce qu'un parrainage doit verser", () => {
  it("étape 1 avec un Discord ancien : les deux côtés et la part « confiance », sans seconde notification", () => {
    const due = planPayouts(input(), RULES);
    expect(keys(due)).toEqual(["STEP:REFEREE:1:lea", "STEP:REFERRER:1:par", "TRUST_BONUS:REFERRER:1:par"]);
    expect(due.find((d) => d.kind === "TRUST_BONUS")).toMatchObject({ quiet: true, big: false, lotId: "l1-trust" });
  });

  it("confiance moyenne : la part « confiance » attend l'étape 3, puis les deux sont versées", () => {
    expect(keys(planPayouts(input({}, { times: times(2), trust: "MEDIUM" }), RULES))).not.toContain("TRUST_BONUS:REFERRER:1:par");
    const paid = ["REFEREE", "REFERRER"].flatMap((side) => [1, 2].map((step) => ({ kind: "STEP" as const, side: side as "REFEREE", step, milestone: null })));
    const due = planPayouts(input({ paid }, { times: times(3), trust: "MEDIUM" }), RULES);
    expect(keys(due)).toEqual(["TRUST_BONUS:REFERRER:1:par", "TRUST_BONUS:REFERRER:2:par", "STEP:REFEREE:3:lea", "STEP:REFERRER:3:par"]);
    expect(due.filter((d) => d.kind === "TRUST_BONUS").every((d) => d.big && !d.quiet)).toBe(true);
  });

  it("rien de ce qui est déjà versé ; un côté sans lot ne verse rien", () => {
    const paid = [
      { kind: "STEP" as const, side: "REFEREE" as const, step: 1, milestone: null },
      { kind: "STEP" as const, side: "REFERRER" as const, step: 1, milestone: null },
      { kind: "TRUST_BONUS" as const, side: "REFERRER" as const, step: 1, milestone: null },
    ];
    expect(planPayouts(input({ paid }), RULES)).toEqual([]);
    const four = planPayouts(input({}, { times: times(4) }), RULES).filter((d) => d.step === 4);
    expect(keys(four)).toEqual(["STEP:REFEREE:4:lea"]);
  });

  it("Ennichi : étapes 1 et 2 multipliées, pas les suivantes", () => {
    const due = planPayouts(input({}, { times: times(3), ennichiMultiplier: 2 }), RULES);
    expect(due.filter((d) => d.step === 1 || d.step === 2).every((d) => d.multiplier === 2)).toBe(true);
    expect(due.filter((d) => d.step === 3).every((d) => d.multiplier === 1)).toBe(true);
    expect(planPayouts(input(), RULES).every((d) => d.multiplier === 1)).toBe(true);
  });

  it("Ennichi : le multiplicateur figé au rattachement fait foi, quel que soit le réglage du moment", () => {
    // Ami arrivé quand la fête valait ×3 : son étape 2, tombée plus tard, reste à ×3
    const paid = ["REFEREE", "REFERRER"].map((side) => ({ kind: "STEP" as const, side: side as "REFEREE", step: 1, milestone: null }));
    const due = planPayouts(input({ paid }, { times: times(2), ennichiMultiplier: 3 }), RULES);
    expect(due.filter((d) => d.step === 2).map((d) => d.multiplier)).toEqual([3, 3, 3]);
    // Un multiplicateur figé mal formé ne retire rien : au moins ×1
    expect(planPayouts(input({}, { ennichiMultiplier: 0 }), RULES).every((d) => d.multiplier === 1)).toBe(true);
  });

  it("stepMultiplier : le ×N figé sur les étapes 1 et 2 seulement, ×1 hors fête", () => {
    expect([1, 2, 3, 4].map((step) => stepMultiplier(2, step))).toEqual([2, 2, 1, 1]);
    expect([1, 2, 3, 4].map((step) => stepMultiplier(null, step))).toEqual([1, 1, 1, 1]);
    expect(stepMultiplier(0, 1)).toBe(1);
  });

  it("grand-parrainage à l'étape 2, une fois, s'il est permis", () => {
    const due = planPayouts(input({}, { times: times(2), grandReferrerId: "papi" }), RULES);
    expect(due.find((d) => d.kind === "GRAND")).toMatchObject({ userId: "papi", actorId: "par", lotId: "grand" });
    expect(planPayouts(input({ grandAllowed: false }, { times: times(2), grandReferrerId: "papi" }), RULES).some((d) => d.kind === "GRAND")).toBe(false);
    const paid = [{ kind: "GRAND" as const, side: null, step: null, milestone: null }];
    expect(planPayouts(input({ paid }, { times: times(2), grandReferrerId: "papi" }), RULES).some((d) => d.kind === "GRAND")).toBe(false);
  });

  it("paliers atteints qui versent quelque chose, une fois chacun", () => {
    const due = planPayouts(input({ installed: 5 }), RULES).filter((d) => d.kind === "MILESTONE");
    expect(due.map((d) => d.milestone?.installed)).toEqual([3, 5]);
    expect(due.every((d) => d.big && d.userId === "par")).toBe(true);
    expect(planPayouts(input({ installed: 5, paidMilestones: [3] }), RULES).filter((d) => d.kind === "MILESTONE").map((d) => d.milestone?.installed)).toEqual([5]);
  });
});
