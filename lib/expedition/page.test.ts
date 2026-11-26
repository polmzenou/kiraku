import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { historyGains, offerState, successRange, topTeam } from "./page";

const defs = BASE_DEFINITIONS;
const rules = {
  cardBonus: SETTING_DEFAULTS["expedition.cardBonus"],
  triumphRewardPct: SETTING_DEFAULTS["expedition.triumphRewardPct"],
  failRewardPct: SETTING_DEFAULTS["expedition.failRewardPct"],
};
// Mythique équilibrée : 50 % de base, plafond 92 %, triomphe 15 %
const type = { minRarity: "MYTHIC", baseSuccessPct: 50, maxSuccessPct: 92, maxTriumphPct: 15, zeni: 1000, boosters: 5, extraLotId: null, durationMinutes: 360 };

describe("état d'une offre", () => {
  it("une offre jouée reste « faite », même désactivée ensuite", () => {
    expect(offerState({ active: false, minDiscoveryPct: 0 }, true, 0)).toBe("DONE");
    expect(offerState({ active: false, minDiscoveryPct: 0 }, false, 0)).toBe("UNAVAILABLE");
    expect(offerState({ active: true, minDiscoveryPct: 30 }, false, 29.9)).toBe("LOCKED");
    expect(offerState({ active: true, minDiscoveryPct: 30 }, false, 30)).toBe("OPEN");
    expect(offerState({ active: true, minDiscoveryPct: 30 }, true, 10)).toBe("DONE");
  });
});

describe("fourchette de réussite", () => {
  it("meilleure équipe réelle : une seule Mythique et des Communes, pas trois cartes de son meilleur palier", () => {
    const team = topTeam([{ rarity: "MYTHIC", cards: 1 }, { rarity: "COMMON", cards: 40 }], defs);
    expect(team?.map((c) => c.rarity)).toEqual(["MYTHIC", "COMMON", "COMMON"]);
    // 50 + 10 (même palier) : la plus juste et la meilleure se confondent
    expect(successRange(type, rules, defs, team)).toEqual({ min: 60, max: 60 });
  });

  it("trois cartes au-dessus de la rareté exigée : jusqu'au plafond", () => {
    const team = topTeam([{ rarity: "XR", cards: 3 }, { rarity: "COMMON", cards: 5 }], defs);
    expect(team?.map((c) => c.rarity)).toEqual(["XR", "XR", "XR"]);
    expect(successRange(type, rules, defs, team)).toEqual({ min: 60, max: 92 });
  });

  it("sans équipe possible ou sans la rareté exigée : la seule valeur sûre", () => {
    expect(topTeam([{ rarity: "MYTHIC", cards: 2 }], defs)).toBeNull();
    expect(topTeam([{ rarity: "INCONNUE", cards: 9 }], defs)).toBeNull();
    const commons = topTeam([{ rarity: "COMMON", cards: 3 }], defs);
    expect(successRange(type, rules, defs, commons)).toEqual({ min: 60, max: 60 });
    expect(successRange(type, rules, defs, null)).toEqual({ min: 60, max: 60 });
  });
});

describe("gains d'une ligne du journal", () => {
  it("ajoute le lot bonus versé aux gains de l'issue", () => {
    const reward = { zeni: 800, boosters: 4, extraLot: true };
    expect(historyGains(reward, { zeni: 50, boosters: [{ boosterTypeId: "a", count: 2 }, { boosterTypeId: "b", count: 1 }] }, 1)).toEqual({ zeni: 850, boosters: 7, cards: 1 });
    expect(historyGains(reward, null, 0)).toEqual({ zeni: 800, boosters: 4, cards: 0 });
    expect(historyGains(null, null, 3)).toEqual({ zeni: 0, boosters: 0, cards: 0 });
  });
});
