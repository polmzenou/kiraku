import { describe, expect, it } from "vitest";
import {
  arrivesDuringFete,
  ennichiPhase,
  ennichiSchedule,
  lastPaidRank,
  nextTierIndex,
  rankBand,
  rankRecruiters,
  streetLampsLit,
  tierProgress,
  tiersReachedBy,
} from "./rules";

const START = new Date("2026-12-01T18:00:00.000Z");
const DAY = 86_400_000;
const rules = { enabled: true, startsAt: START, days: 14, closingDays: 3 };
const at = (days: number) => new Date(START.getTime() + days * DAY);
const tiers = [{ lanterns: 25 }, { lanterns: 50 }, { lanterns: 200 }, { lanterns: 500 }];

describe("calendrier et phase de l'Ennichi", () => {
  it("14 jours de fête puis 3 jours de clôture", () => {
    expect(ennichiSchedule(rules)).toEqual({ startsAt: START, endsAt: at(14), closesAt: at(17) });
    expect(ennichiSchedule({ ...rules, startsAt: null })).toBeNull();
  });

  it("annoncée, en cours, en clôture, puis finie au tirage", () => {
    expect(ennichiPhase(rules, at(-1), null)).toBe("before");
    expect(ennichiPhase(rules, at(0), null)).toBe("live");
    expect(ennichiPhase(rules, at(13.9), null)).toBe("live");
    expect(ennichiPhase(rules, at(14), null)).toBe("closing");
    // Après la date de clôture, on attend le tirage
    expect(ennichiPhase(rules, at(30), null)).toBe("closing");
    expect(ennichiPhase(rules, at(17), at(17))).toBe("closed");
    expect(ennichiPhase({ ...rules, enabled: false }, at(1), null)).toBe("off");
    expect(ennichiPhase({ ...rules, startsAt: null }, at(1), null)).toBe("off");
  });

  it("seul un ami arrivé pendant la fête compte", () => {
    expect(arrivesDuringFete(rules, at(2), null)).toBe(true);
    expect(arrivesDuringFete(rules, at(15), null)).toBe(false);
    expect(arrivesDuringFete(rules, at(-0.5), null)).toBe(false);
  });
});

describe("lanternes", () => {
  it("prochain palier, paliers atteints et avancement", () => {
    expect(nextTierIndex(0, tiers)).toBe(0);
    expect(nextTierIndex(30, tiers)).toBe(1);
    expect(nextTierIndex(600, tiers)).toBeNull();
    // Un palier déjà atteint reste atteint, même si des lanternes s'éteignent (parrainage révoqué)
    expect(nextTierIndex(20, tiers, [true])).toBe(1);
    expect(tiersReachedBy(200, tiers)).toEqual([0, 1, 2]);
    expect(tierProgress(30, tiers, 1)).toBe(20);
    expect(tierProgress(10, tiers, 0)).toBe(40);
    expect(tierProgress(999, tiers, null)).toBe(100);
  });

  it("rue dessinée : au moins une lanterne dès la première, toutes au dernier palier", () => {
    expect(streetLampsLit(0, tiers, 14)).toBe(0);
    expect(streetLampsLit(1, tiers, 14)).toBe(1);
    expect(streetLampsLit(250, tiers, 14)).toBe(7);
    expect(streetLampsLit(800, tiers, 14)).toBe(14);
  });
});

describe("banzuke", () => {
  it("le plus d'amis installés d'abord ; à égalité, le premier arrivé à ce compte", () => {
    const ranked = rankRecruiters([
      { userId: "b", count: 3, reachedAt: at(5) },
      { userId: "a", count: 3, reachedAt: at(4) },
      { userId: "c", count: 7, reachedAt: at(9) },
      { userId: "z", count: 0, reachedAt: at(1) },
      { userId: "d", count: 3, reachedAt: at(4) },
    ]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([["c", 1], ["a", 2], ["d", 3], ["b", 4]]);
  });

  it("lots par rang, et dernier rang payé", () => {
    const ranks = [{ from: 1, to: 1 }, { from: 2, to: 3 }, { from: 4, to: 10 }, { from: 11, to: 50 }];
    expect(rankBand(3, ranks)).toEqual({ from: 2, to: 3 });
    expect(rankBand(51, ranks)).toBeNull();
    expect(lastPaidRank(ranks)).toBe(50);
  });
});
