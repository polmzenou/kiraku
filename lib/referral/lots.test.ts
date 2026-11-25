import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { otherSettingLotIds, referralLotAccess, referralLotUsages, type ReferralLotSettings } from "./lots";

const base: ReferralLotSettings = {
  "referral.referrerLotId": null,
  "referral.refereeLotId": null,
  "referral.milestones": [],
  "referral.v2.stepLots": SETTING_DEFAULTS["referral.v2.stepLots"],
  "referral.v2.grandLotId": null,
  "referral.v2.milestones": SETTING_DEFAULTS["referral.v2.milestones"],
  "ennichi.tiers": SETTING_DEFAULTS["ennichi.tiers"],
  "ennichi.ranks": SETTING_DEFAULTS["ennichi.ranks"],
  "ennichi.omikuji": SETTING_DEFAULTS["ennichi.omikuji"],
};

describe("lots du parrainage et de l'Ennichi", () => {
  it("relève chaque lot versé, avec tous ses usages", () => {
    const usages = referralLotUsages({
      ...base,
      "referral.referrerLotId": "v1-parrain",
      "referral.milestones": [{ referrals: 5, lotId: "v1-palier" }],
      "referral.v2.stepLots": [
        { referee: "etape-1", referrer: "etape-1", referrerTrust: "confiance" },
        { referee: null, referrer: "etape-2", referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
      ],
      "referral.v2.grandLotId": "grand",
      "referral.v2.milestones": [{ installed: 3, lotId: "palier-3", choiceVouchers: 0, oneOfOne: false, ambassador: false, legend: false }],
      "ennichi.tiers": base["ennichi.tiers"].map((t, i) => ({ ...t, lotId: i === 3 ? "lanterne-4" : null })),
      "ennichi.ranks": [{ from: 1, to: 1, title: "yokozuna", lotId: "rang-1", choiceVouchers: 0, oneOfOne: true }],
      "ennichi.omikuji": [{ lotId: null, oneOfOne: true, count: 1 }, { lotId: "omikuji", oneOfOne: false, count: 20 }],
    });
    expect(usages.get("v1-parrain")).toEqual([{ kind: "V1_REFERRER" }]);
    expect(usages.get("v1-palier")).toEqual([{ kind: "V1_MILESTONE", referrals: 5 }]);
    // Le même lot des deux côtés de l'étape 1
    expect(usages.get("etape-1")).toEqual([
      { kind: "STEP", step: 1, side: "REFEREE" },
      { kind: "STEP", step: 1, side: "REFERRER" },
    ]);
    expect(usages.get("confiance")).toEqual([{ kind: "STEP", step: 1, side: "TRUST" }]);
    expect(usages.get("grand")).toEqual([{ kind: "GRAND" }]);
    expect(usages.get("palier-3")).toEqual([{ kind: "MILESTONE", installed: 3 }]);
    expect(usages.get("lanterne-4")).toEqual([{ kind: "TIER", tier: 4 }]);
    expect(usages.get("rang-1")).toEqual([{ kind: "RANK", from: 1, to: 1 }]);
    expect(usages.get("omikuji")).toEqual([{ kind: "OMIKUJI", line: 2 }]);
    expect(usages.size).toBe(10);
  });

  it("aucun lot posé : rien à modifier", () => {
    expect(referralLotUsages(base).size).toBe(0);
  });

  it("lots des autres réglages : fin de saison du classé et jauge d'événement", () => {
    const ranked = { ...SETTING_DEFAULTS["ranked.rewardLots"], GOLD: "or", CHAMPION: "champion" };
    expect([...otherSettingLotIds({ "ranked.rewardLots": ranked, "home.eventGauge.rewardLotId": "jauge" })].sort()).toEqual(["champion", "jauge", "or"]);
    expect(otherSettingLotIds({ "ranked.rewardLots": SETTING_DEFAULTS["ranked.rewardLots"], "home.eventGauge.rewardLotId": null }).size).toBe(0);
  });

  it("le DEV modifie un lot du parrainage ou créé depuis sa page, jamais un lot qui sert ailleurs", () => {
    expect(referralLotAccess({ referral: true, createdHere: false, elsewhere: false })).toBe("EDITABLE");
    expect(referralLotAccess({ referral: false, createdHere: true, elsewhere: false })).toBe("EDITABLE");
    expect(referralLotAccess({ referral: true, createdHere: false, elsewhere: true })).toBe("LOT_SHARED");
    expect(referralLotAccess({ referral: false, createdHere: false, elsewhere: false })).toBe("NOT_REFERRAL_LOT");
    expect(referralLotAccess({ referral: false, createdHere: false, elsewhere: true })).toBe("NOT_REFERRAL_LOT");
  });
});
