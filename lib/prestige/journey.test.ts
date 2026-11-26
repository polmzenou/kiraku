import { describe, expect, it } from "vitest";
import { earnedBadges } from "../profile/badges";
import { conditionSchema, evaluateCondition, type ProfileStats } from "../profile/conditions";
import { isFrameStyle } from "../profile/frames";
import { isNameColorStyle } from "../profile/name-colors";
import { PRESTIGE_COSMETICS } from "./cosmetics";
import { keptSpan, readCycleBoosters, readHeirs, readJourney } from "./journey";

describe("parcours d'un exemplaire consacré", () => {
  it("relit les propriétaires et les cycles, sans faire confiance au JSON", () => {
    const journey = readJourney({
      owners: [
        { ownerId: "a", via: "DRAW", at: "2026-11-01T10:00:00.000Z" },
        { ownerId: null, via: "TRADE", at: "2026-11-02T10:00:00.000Z" },
        { ownerId: "b", via: "VOL", at: "2026-11-03T10:00:00.000Z" },
        { ownerId: "c", via: "GIFT", at: "pas une date" },
      ],
      cycles: [3, 1, 2, 2, 0, "4"],
      prestige: 5,
    });
    expect(journey.owners.map((o) => [o.ownerId, o.via])).toEqual([
      ["a", "DRAW"],
      [null, "TRADE"],
    ]);
    expect(journey.cycles).toEqual([1, 2, 3]);
    expect(journey.prestige).toBe(5);
    expect(readJourney(null)).toEqual({ owners: [], cycles: [], prestige: 0 });
  });

  it("dit de quel cycle à quel cycle la carte a été gardée", () => {
    expect(keptSpan([1, 2, 3, 4, 5])).toEqual({ from: 1, to: 5 });
    expect(keptSpan([2])).toEqual({ from: 2, to: 2 });
    expect(keptSpan([])).toBeNull();
  });

  it("relit les héritières d'un cycle", () => {
    expect(
      readHeirs([
        { userCardId: "u1", cardId: "c1", heritage: 2, printing: null, serial: null },
        { userCardId: "u2", cardId: "c2", heritage: 1, printing: 1, serial: 17 },
        { userCardId: "u3", cardId: "c3", heritage: 0 },
        { cardId: "c4", heritage: 1 },
      ]),
    ).toEqual([
      { userCardId: "u1", cardId: "c1", heritage: 2, printing: null, serial: null },
      { userCardId: "u2", cardId: "c2", heritage: 1, printing: 1, serial: 17 },
    ]);
  });

  it("relit les boosters offerts par une renaissance, sans rien deviner", () => {
    expect(readCycleBoosters({ slug: "mythique", count: 1 })).toEqual({ slug: "mythique", count: 1 });
    expect(readCycleBoosters(null)).toBeNull();
    expect(readCycleBoosters({ slug: "", count: 1 })).toBeNull();
    expect(readCycleBoosters({ slug: "mythique", count: 0 })).toBeNull();
    expect(readCycleBoosters({ slug: "mythique", count: "2" })).toBeNull();
    expect(readCycleBoosters([{ slug: "mythique", count: 1 }])).toBeNull();
  });
});

describe("cosmétiques du prestige", () => {
  const stats = (extra: Partial<ProfileStats>): ProfileStats => ({
    uniqueCards: 0,
    byRarity: {},
    completedSeries: new Set(),
    seriesProgress: {},
    boostersOpened: 0,
    tradesDone: 0,
    apocalypseRuined: 0,
    tier: "BRONZE",
    discoveredPercent: 0,
    discoveredByRarity: {},
    ambassador: false,
    ...extra,
  });

  it("les conditions suivent le prestige, le sanctuaire et les gravées", () => {
    expect(evaluateCondition({ type: "PRESTIGE", n: 3 }, stats({ prestige: 2 }))).toEqual({ unlocked: false, current: 2, goal: 3 });
    expect(evaluateCondition({ type: "PRESTIGE", n: 3 }, stats({ prestige: 4 })).unlocked).toBe(true);
    expect(evaluateCondition({ type: "CONSECRATED_COUNT", n: 1 }, stats({})).unlocked).toBe(false);
    expect(evaluateCondition({ type: "CONSECRATED_COUNT", n: 1 }, stats({ consecrated: 1 })).unlocked).toBe(true);
    expect(evaluateCondition({ type: "PRINTINGS_OWNED", n: 5 }, stats({ printingsOwned: 5 })).unlocked).toBe(true);
  });

  it("badges du prestige : rené, consacreur, graveur", () => {
    const base = { createdAt: new Date(), pioneerUntil: null, staff: false, ambassador: false, installedReferrals: 0, sponsorReferrals: 0, recruiterReferrals: 0, discordLinked: false };
    expect(earnedBadges(base)).toEqual([]);
    expect(earnedBadges({ ...base, prestige: 1, consecrated: 2, engraved: 1 })).toEqual(["REBORN", "CONSECRATOR", "ENGRAVER"]);
  });

  it("le jeu installable est valide : identifiants uniques, conditions lisibles, styles connus", () => {
    expect(new Set(PRESTIGE_COSMETICS.map((c) => c.slug)).size).toBe(PRESTIGE_COSMETICS.length);
    for (const c of PRESTIGE_COSMETICS) {
      expect(conditionSchema.safeParse(c.condition).success, c.slug).toBe(true);
      if (c.kind === "FRAME") expect(isFrameStyle(c.frameStyle), c.slug).toBe(true);
      if (c.kind === "NAME_COLOR") expect(isNameColorStyle(c.nameColor), c.slug).toBe(true);
    }
  });
});
