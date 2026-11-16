import { describe, expect, it } from "vitest";
import { isEmptyReward, outcomeFor, rewardsByOutcome } from "./rewards";

const rules = { triumphRewardPct: 150, failRewardPct: 25 };

describe("issue d'une expédition", () => {
  it("compare le tirage aux chances en points de base", () => {
    // 60 % de réussite dont 9 % de triomphe
    expect(outcomeFor(0, 6000, 900)).toBe("TRIUMPH");
    expect(outcomeFor(899, 6000, 900)).toBe("TRIUMPH");
    expect(outcomeFor(900, 6000, 900)).toBe("SUCCESS");
    expect(outcomeFor(5999, 6000, 900)).toBe("SUCCESS");
    expect(outcomeFor(6000, 6000, 900)).toBe("FAILURE");
    expect(outcomeFor(9999, 6000, 900)).toBe("FAILURE");
  });

  it("une expédition sûre ne rate jamais", () => {
    for (const roll of [0, 2500, 9999]) expect(outcomeFor(roll, 10_000, 0)).not.toBe("FAILURE");
  });

  it("refuse un tirage hors bornes", () => {
    expect(() => outcomeFor(10_000, 5000, 0)).toThrow(RangeError);
    expect(() => outcomeFor(-1, 5000, 0)).toThrow(RangeError);
    expect(() => outcomeFor(1.5, 5000, 0)).toThrow(RangeError);
  });

  it("majore le triomphe et consoles l'échec", () => {
    const r = rewardsByOutcome({ zeni: 1000, boosters: 5, extraLotId: "lot1" }, rules);
    expect(r.SUCCESS).toEqual({ zeni: 1000, boosters: 5, extraLot: true });
    // Boosters arrondis au supérieur : 7,5 → 8
    expect(r.TRIUMPH).toEqual({ zeni: 1500, boosters: 8, extraLot: true });
    expect(r.FAILURE).toEqual({ zeni: 250, boosters: 0, extraLot: false });
  });

  it("gère les gains nuls", () => {
    const r = rewardsByOutcome({ zeni: 0, boosters: 3, extraLotId: null }, { triumphRewardPct: 100, failRewardPct: 0 });
    expect(r.FAILURE).toEqual({ zeni: 0, boosters: 0, extraLot: false });
    expect(isEmptyReward(r.FAILURE)).toBe(true);
    expect(isEmptyReward(r.SUCCESS)).toBe(false);
    expect(r.TRIUMPH).toEqual(r.SUCCESS);
  });
});
