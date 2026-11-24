import { describe, expect, it } from "vitest";
import { planClawback, sumGrants, type Holdings, type RewardGrant } from "./clawback";

const grant = (over: Partial<RewardGrant> = {}): RewardGrant => ({ zeni: 0, credits: {}, sealedIds: [], cardIds: [], voucherIds: [], ...over });
const holdings = (over: Partial<Holdings> = {}): Holdings => ({
  coins: 0,
  credits: {},
  sealedIds: new Set(),
  cardIds: new Set(),
  voucherIds: new Set(),
  ...over,
});

describe("reprise d'un parrainage", () => {
  const grants = [
    grant({ zeni: 2_000, credits: { standard: 10, mythique: 2 }, sealedIds: ["s1"], cardIds: ["c1", "c2"] }),
    grant({ zeni: 1_000, credits: { standard: 5 }, sealedIds: ["s2"], voucherIds: ["v1"] }),
  ];

  it("additionne les versements, sans compter deux fois le même objet", () => {
    expect(sumGrants([...grants, grant({ cardIds: ["c1"] })])).toEqual({
      zeni: 3_000,
      credits: { standard: 15, mythique: 2 },
      sealedIds: ["s1", "s2"],
      cardIds: ["c1", "c2"],
      voucherIds: ["v1"],
    });
  });

  it("tout est repris quand le joueur a tout gardé", () => {
    const plan = planClawback(
      grants,
      holdings({ coins: 9_000, credits: { standard: 40, mythique: 3 }, sealedIds: new Set(["s1", "s2"]), cardIds: new Set(["c1", "c2"]), voucherIds: new Set(["v1"]) }),
    );
    expect(plan).toMatchObject({ zeni: 3_000, credits: { standard: 15, mythique: 2 }, sealedIds: ["s1", "s2"], cardIds: ["c1", "c2"], voucherIds: ["v1"] });
    expect(plan.missing).toEqual({ zeni: 0, credits: {}, sealed: 0, cards: 0, vouchers: 0 });
  });

  it("jamais sous zéro : Zeni dans la limite du solde, crédits dans la limite du reste, objets encore là seulement", () => {
    const plan = planClawback(grants, holdings({ coins: 1_200, credits: { standard: 4 }, sealedIds: new Set(["s2"]), cardIds: new Set(["c2", "autre"]) }));
    expect(plan.zeni).toBe(1_200);
    expect(plan.credits).toEqual({ standard: 4 });
    expect(plan.sealedIds).toEqual(["s2"]);
    expect(plan.cardIds).toEqual(["c2"]);
    expect(plan.voucherIds).toEqual([]);
    expect(plan.missing).toEqual({ zeni: 1_800, credits: { standard: 11, mythique: 2 }, sealed: 1, cards: 1, vouchers: 1 });
  });

  it("un solde négatif ou des valeurs illisibles ne font rien reprendre", () => {
    const plan = planClawback([grant({ zeni: 500, credits: { standard: Number.NaN } })], holdings({ coins: -50, credits: { standard: -3 } }));
    expect(plan.zeni).toBe(0);
    expect(plan.credits).toEqual({});
    expect(plan.missing.zeni).toBe(500);
  });
});
