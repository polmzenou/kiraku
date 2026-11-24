import { describe, expect, it } from "vitest";
import { ladderProgress, milestonePays, nextMilestone, reachedMilestones } from "./ladder";
import { DEFAULT_REFERRAL_V2_RULES as RULES, type ReferralMilestone } from "./rules";

const M = RULES.milestones;
const at = (installed: number) => M.find((m) => m.installed === installed) as ReferralMilestone;

describe("paliers du parrain", () => {
  it("atteints et prochain, selon les amis installés", () => {
    expect(reachedMilestones(0, M)).toEqual([]);
    expect(nextMilestone(0, M)?.installed).toBe(1);
    expect(reachedMilestones(4, M).map((m) => m.installed)).toEqual([1, 3]);
    expect(nextMilestone(4, M)?.installed).toBe(5);
    expect(reachedMilestones(100, M)).toHaveLength(M.length);
    expect(nextMilestone(100, M)).toBeNull();
  });

  it("avancement depuis le dernier palier atteint", () => {
    expect(ladderProgress(7, M)).toEqual({ from: 5, to: 10, have: 7 });
    expect(ladderProgress(0, M)).toEqual({ from: 0, to: 1, have: 0 });
    expect(ladderProgress(150, M)).toEqual({ from: 100, to: null, have: 150 });
  });

  it("un palier qui ne débloque qu'un badge ne verse rien ; bons, 1/1, Ambassadeur et lot versent", () => {
    expect(milestonePays(at(1))).toBe(false);
    expect(milestonePays(at(5))).toBe(true);
    expect(milestonePays(at(25))).toBe(true);
    expect(milestonePays(at(100))).toBe(true);
    expect(milestonePays({ ...at(3), lotId: "lot-referral-v2-palier-3" })).toBe(true);
  });
});
