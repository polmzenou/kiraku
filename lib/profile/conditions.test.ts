import { describe, expect, it } from "vitest";
import {
  discoveredPercent,
  earnedBadges,
  evaluateCondition,
  labelFor,
  orderedBadges,
  parseCondition,
  referencedSeries,
  type ProfileStats,
} from "./conditions";

const stats: ProfileStats = {
  uniqueCards: 120,
  byRarity: { MYTHIC: 2, LEGENDARY: 7 },
  completedSeries: new Set(["csm"]),
  seriesProgress: { csm: { owned: 12, total: 12 }, op: { owned: 2, total: 195 } },
  boostersOpened: 340,
  tradesDone: 3,
  apocalypseRuined: 0,
  tier: "GOLD",
  discoveredPercent: 42,
  discoveredByRarity: { MYTHIC: 12, AR: 5, GOLD: 1, COMMON: 300 },
  ambassador: false,
};

describe("conditions de déblocage", () => {
  it.each([
    [{ type: "ALWAYS" }, true, 1, 1],
    [{ type: "UNIQUE_CARDS", n: 100 }, true, 100, 100],
    [{ type: "UNIQUE_CARDS", n: 1000 }, false, 120, 1000],
    [{ type: "RARITY_OWNED", rarity: "MYTHIC", n: 3 }, false, 2, 3],
    [{ type: "RARITY_OWNED", rarity: "LEGENDARY", n: 5 }, true, 5, 5],
    [{ type: "SERIES_COMPLETE", seriesId: "csm" }, true, 12, 12],
    [{ type: "SERIES_COMPLETE", seriesId: "op" }, false, 2, 195],
    [{ type: "SERIES_COMPLETED_COUNT", n: 10 }, false, 1, 10],
    [{ type: "BOOSTERS_OPENED", n: 100 }, true, 100, 100],
    [{ type: "TRADES_DONE", n: 25 }, false, 3, 25],
    [{ type: "APOCALYPSE_RUINED", n: 1 }, false, 0, 1],
    [{ type: "RANK_TIER", tier: "SILVER" }, true, 2, 2],
    [{ type: "RANK_TIER", tier: "CHAMPION" }, false, 3, 6],
    [{ type: "CATALOG_DISCOVERED_PERCENT", n: 35 }, true, 35, 35],
    [{ type: "CATALOG_DISCOVERED_PERCENT", n: 50 }, false, 42, 50],
    [{ type: "RARITIES_DISCOVERED", rarities: ["MYTHIC", "AR", "GOLD"], n: 20 }, false, 18, 20],
    [{ type: "RARITIES_DISCOVERED", rarities: ["MYTHIC", "AR", "GOLD"], n: 15 }, true, 15, 15],
    [{ type: "RARITIES_DISCOVERED", rarities: ["MYTHIC", "MYTHIC", "LEGENDARY"], n: 20 }, false, 12, 20],
  ])("%o", (raw, unlocked, current, goal) => {
    expect(evaluateCondition(parseCondition(raw), stats)).toEqual({ unlocked, current, goal });
  });

  it("réserve une condition AMBASSADOR au rôle donné par l'admin", () => {
    const condition = parseCondition({ type: "AMBASSADOR" });
    expect(evaluateCondition(condition, stats)).toEqual({ unlocked: false, current: 0, goal: 1 });
    expect(evaluateCondition(condition, { ...stats, ambassador: true })).toEqual({ unlocked: true, current: 1, goal: 1 });
    expect(parseCondition({ type: "AMBASSADOR", n: 1 })).toBeNull();
  });

  it("une condition illisible ou une série inconnue ne débloque rien", () => {
    expect(evaluateCondition(parseCondition({ type: "NOPE" }), stats).unlocked).toBe(false);
    expect(evaluateCondition(parseCondition({ type: "SERIES_COMPLETE", seriesId: "inconnue" }), stats).unlocked).toBe(false);
  });

  it("refuse un pourcentage hors de 1 à 100 et une liste de raretés vide", () => {
    expect(parseCondition({ type: "CATALOG_DISCOVERED_PERCENT", n: 101 })).toBeNull();
    expect(parseCondition({ type: "CATALOG_DISCOVERED_PERCENT", n: 0 })).toBeNull();
    expect(parseCondition({ type: "RARITIES_DISCOVERED", rarities: [], n: 1 })).toBeNull();
  });

  it("liste les séries à charger", () => {
    expect(referencedSeries([parseCondition({ type: "SERIES_COMPLETE", seriesId: "a" }), null, parseCondition({ type: "SERIES_COMPLETE", seriesId: "a" })])).toEqual(["a"]);
  });
});

describe("% du catalogue découvert", () => {
  it("arrondit à l'inférieur et ne dépasse pas 100", () => {
    expect(discoveredPercent(499, 1000)).toBe(49);
    expect(discoveredPercent(999, 1000)).toBe(99);
    expect(discoveredPercent(1000, 1000)).toBe(100);
    expect(discoveredPercent(1001, 1000)).toBe(100);
    expect(discoveredPercent(5, 0)).toBe(0);
  });
});

describe("libellés accordés", () => {
  const label = { fr: "Collectionneur", frFem: "Collectionneuse", en: "Collector" };
  it("accorde en français, garde l'anglais tel quel", () => {
    expect(labelFor(label, "fr", "MASC")).toBe("Collectionneur");
    expect(labelFor(label, "fr", "FEM")).toBe("Collectionneuse");
    expect(labelFor(label, "en", "FEM")).toBe("Collector");
    expect(labelFor({ fr: "Devil Hunter" }, "en", "FEM")).toBe("Devil Hunter");
  });
});

describe("badges", () => {
  const base = {
    createdAt: new Date("2026-10-01"),
    pioneerUntil: new Date("2026-12-31"),
    staff: false,
    ambassador: true,
    qualifiedReferrals: 3,
    sponsorReferrals: 3,
    recruiterReferrals: 10,
    discordLinked: true,
  };
  it("dérive les badges du compte", () => {
    expect(earnedBadges(base)).toEqual(["PIONEER", "AMBASSADOR", "SPONSOR", "VERIFIED"]);
    expect(earnedBadges({ ...base, pioneerUntil: null, ambassador: false, qualifiedReferrals: 1, discordLinked: false })).toEqual([]);
  });
  it("Ambassadeur vient du rôle, Parrain des filleuls", () => {
    expect(earnedBadges({ ...base, ambassador: false })).not.toContain("AMBASSADOR");
    expect(earnedBadges({ ...base, qualifiedReferrals: 0 })).toEqual(["PIONEER", "AMBASSADOR", "VERIFIED"]);
    expect(earnedBadges({ ...base, sponsorReferrals: 0 })).not.toContain("SPONSOR");
  });
  it("Recruteur vient du palier de filleuls qualifiés, en plus de Parrain", () => {
    expect(earnedBadges({ ...base, qualifiedReferrals: 9 })).not.toContain("RECRUITER");
    expect(earnedBadges({ ...base, qualifiedReferrals: 10 })).toEqual(["PIONEER", "AMBASSADOR", "SPONSOR", "RECRUITER", "VERIFIED"]);
    expect(earnedBadges({ ...base, qualifiedReferrals: 50, recruiterReferrals: 0 })).not.toContain("RECRUITER");
  });
  it("DEV vient du rôle d'équipe, en tête des badges", () => {
    expect(earnedBadges({ ...base, staff: true })).toEqual(["DEV", "PIONEER", "AMBASSADOR", "SPONSOR", "VERIFIED"]);
    expect(earnedBadges(base)).not.toContain("DEV");
  });
  it("respecte l'ordre choisi parmi les badges obtenus", () => {
    expect(orderedBadges(["PIONEER", "VERIFIED"], ["VERIFIED", "AMBASSADOR"])).toEqual(["VERIFIED"]);
    expect(orderedBadges(["PIONEER", "VERIFIED"], [])).toEqual(["PIONEER", "VERIFIED"]);
  });
});
