import { describe, expect, it } from "vitest";
import { DEFAULT_RANKED_RULES as R } from "./defaults";
import { applyResult, botDelta, divisionRange, isCrushing, ladderRanges, ladderTier, LADDER, matchRange, pcDelta, rankOf, rowOf } from "./rules";
import { nextSeasonBoundary, resetPc, rewardTier } from "./season";

describe("rangs et divisions", () => {
  it.each([
    [0, "BRONZE", 3],
    [99, "BRONZE", 3],
    [100, "BRONZE", 2],
    [299, "BRONZE", 1],
    [300, "SILVER", 3],
    [599, "SILVER", 1],
    [600, "GOLD", 3],
    [900, "EMERALD", 3],
    [1199, "EMERALD", 1],
    [1200, "ELITE", 3],
    [1500, "CHAMPION", 3],
    [1600, "CHAMPION", 2],
    [1700, "CHAMPION", 1],
    [2500, "CHAMPION", 1],
  ] as const)("%i PC → %s %i", (pc, tier, division) => {
    expect(rankOf(pc, false, R)).toMatchObject({ tier, division });
  });

  it("Grand Champion : 1 800 PC et dans le top 100, sinon Champion I sans perte", () => {
    expect(rankOf(1800, true, R)).toMatchObject({ tier: "GRAND_CHAMPION", division: null });
    expect(rankOf(1799, true, R)).toMatchObject({ tier: "CHAMPION", division: 1 });
    expect(rankOf(2400, false, R)).toMatchObject({ tier: "CHAMPION", division: 1 });
  });

  it("progression dans la division, puis vers le rang suivant", () => {
    expect(rankOf(150, false, R)).toMatchObject({ floor: 100, next: 200, progress: 0.5 });
    expect(rankOf(250, false, R)).toMatchObject({ floor: 200, next: 300, progress: 0.5 });
    expect(rankOf(1750, false, R)).toMatchObject({ floor: 1700, next: 1800, progress: 0.5 });
  });
});

describe("barème", () => {
  const row = rowOf(rankOf(600, false, R), R); // Or
  it("victoire et défaite simples à niveau égal", () => {
    expect(pcDelta({ pc: 600, oppPc: 600, won: true, crushing: false, row }, R)).toBe(24);
    expect(pcDelta({ pc: 600, oppPc: 600, won: false, crushing: false, row }, R)).toBe(-16);
  });

  it("écrasantes", () => {
    expect(pcDelta({ pc: 600, oppPc: 600, won: true, crushing: true, row }, R)).toBe(36);
    expect(pcDelta({ pc: 600, oppPc: 600, won: false, crushing: true, row }, R)).toBe(-24);
  });

  it("écart de niveau : plus fort rapporte plus et coûte moins, borné à ±50 %", () => {
    expect(pcDelta({ pc: 600, oppPc: 800, won: true, crushing: false, row }, R)).toBe(36); // +50 %
    expect(pcDelta({ pc: 600, oppPc: 2000, won: true, crushing: false, row }, R)).toBe(36);
    expect(pcDelta({ pc: 600, oppPc: 800, won: false, crushing: false, row }, R)).toBe(-8);
    expect(pcDelta({ pc: 600, oppPc: 0, won: true, crushing: false, row }, R)).toBe(12);
    expect(pcDelta({ pc: 600, oppPc: 0, won: false, crushing: false, row }, R)).toBe(-24);
  });

  it("plus on monte, moins une victoire rapporte et plus une défaite coûte", () => {
    const at = (pc: number) => rowOf(rankOf(pc, pc >= 1800, R), R);
    expect([0, 300, 600, 900, 1200, 1500, 1800].map((pc) => at(pc).win)).toEqual([30, 27, 24, 21, 18, 15, 12]);
    expect([0, 300, 600, 900, 1200, 1500, 1800].map((pc) => at(pc).loss)).toEqual([10, 13, 16, 19, 22, 25, 28]);
  });

  it("écrasante : ≥ 60 % des PV ou aucune carte perdue", () => {
    expect(isCrushing({ hpLeft: 300, hpMax: 500, cardsLost: 1 }, 60)).toBe(true);
    expect(isCrushing({ hpLeft: 299, hpMax: 500, cardsLost: 1 }, 60)).toBe(false);
    expect(isCrushing({ hpLeft: 10, hpMax: 500, cardsLost: 0 }, 60)).toBe(true);
  });

  it("contre un bot : la moitié", () => {
    expect(botDelta(24, R)).toBe(12);
    expect(botDelta(-15, R)).toBe(-8);
  });
});

describe("plancher et protection", () => {
  it("jamais sous 0 PC", () => {
    expect(applyResult({ pc: 5, delta: -15, protection: 0 }, R)).toMatchObject({ pc: 0, delta: -5 });
  });

  it("une montée de rang donne la protection, pas une montée de division", () => {
    expect(applyResult({ pc: 590, delta: 24, protection: 0 }, R)).toMatchObject({ pc: 614, promoted: true, protection: 3 });
    expect(applyResult({ pc: 380, delta: 27, protection: 0 }, R)).toMatchObject({ promoted: false, protection: 0 });
  });

  it("protégé : une défaite ne fait pas redescendre sous le plancher du rang, et le compteur baisse", () => {
    expect(applyResult({ pc: 610, delta: -24, protection: 3 }, R)).toMatchObject({ pc: 600, saved: true, demoted: false, protection: 2 });
    expect(applyResult({ pc: 610, delta: -24, protection: 0 }, R)).toMatchObject({ pc: 586, demoted: true });
    expect(applyResult({ pc: 650, delta: 24, protection: 1 }, R)).toMatchObject({ protection: 0 });
  });

  it("le rang à divisions ignore le top 100", () => {
    expect(ladderTier(5000, R)).toBe("CHAMPION");
  });
});

describe("appariement", () => {
  it("±150 PC, qui s'élargit de 5 par seconde jusqu'à 600", () => {
    expect(matchRange(0, R)).toBe(150);
    expect(matchRange(20, R)).toBe(250);
    expect(matchRange(1_000, R)).toBe(600);
  });
});

describe("saisons", () => {
  const tz = "Europe/Paris";
  it("changent le 1er des mois impairs (2 mois) à minuit, heure de Paris", () => {
    expect(nextSeasonBoundary(new Date("2026-10-15T12:00:00Z"), 2, tz).toISOString()).toBe("2026-10-31T23:00:00.000Z"); // 1er nov., UTC+1
    expect(nextSeasonBoundary(new Date("2026-10-31T23:00:00Z"), 2, tz).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(nextSeasonBoundary(new Date("2026-12-31T23:00:00Z"), 2, tz).toISOString()).toBe("2027-02-28T23:00:00.000Z");
    expect(nextSeasonBoundary(new Date("2027-04-15T10:00:00Z"), 2, tz).toISOString()).toBe("2027-04-30T22:00:00.000Z"); // UTC+2
  });

  it("remise à zéro : on garde la moitié au-dessus de 600", () => {
    expect([0, 450, 600, 900, 1800].map((pc) => resetPc(pc, R))).toEqual([0, 450, 600, 750, 1200]);
  });

  it("le lot suit le meilleur rang atteint", () => {
    expect(rewardTier(950, false, R)).toBe("EMERALD");
    expect(rewardTier(1900, true, R)).toBe("GRAND_CHAMPION");
  });
});

describe("paliers des divisions", () => {
  const ranges = ladderRanges(R);

  it("trois divisions par rang, de III à I, qui se suivent sans trou", () => {
    expect(ranges.map((t) => t.tier)).toEqual([...LADDER]);
    expect(ranges[0].divisions).toEqual([
      { division: 3, min: 0, max: 99 },
      { division: 2, min: 100, max: 199 },
      { division: 1, min: 200, max: 299 },
    ]);
    const flat = ranges.flatMap((t) => t.divisions);
    for (let i = 1; i < flat.length; i++) expect(flat[i].min).toBe((flat[i - 1].max ?? Infinity) + 1);
  });

  it("Champion I n'a pas de plafond", () => {
    expect(ranges.at(-1)!.divisions.at(-1)).toEqual({ division: 1, min: 1700, max: null });
  });

  it("chaque palier donne bien sa division à rankOf", () => {
    for (const t of ranges) {
      for (const d of t.divisions) {
        expect(rankOf(d.min, false, R)).toMatchObject({ tier: t.tier, division: d.division });
        if (d.max !== null) expect(rankOf(d.max, false, R)).toMatchObject({ tier: t.tier, division: d.division });
      }
    }
  });

  it("division d'un rang, Grand Champion compris", () => {
    expect(divisionRange({ tier: "GOLD", division: 2 }, R)).toEqual({ min: 700, max: 799 });
    expect(divisionRange({ tier: "GRAND_CHAMPION", division: null }, R)).toEqual({ min: 1800, max: null });
  });
});
