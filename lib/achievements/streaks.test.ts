import { describe, expect, it } from "vitest";
import { longestDayRun, longestRun } from "./streaks";

describe("longestRun", () => {
  it("compte la plus longue suite", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun([false, false])).toBe(0);
    expect(longestRun([true, true, false, true, true, true, false])).toBe(3);
    expect(longestRun([true, true, true, true, true])).toBe(5);
  });
});

describe("longestDayRun", () => {
  it("jours consécutifs, doublons et désordre tolérés", () => {
    expect(longestDayRun([])).toBe(0);
    expect(longestDayRun(["2026-11-01"])).toBe(1);
    expect(longestDayRun(["2026-11-03", "2026-11-01", "2026-11-02", "2026-11-02", "2026-11-05"])).toBe(3);
  });
  it("traverse les fins de mois et d'année", () => {
    expect(longestDayRun(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])).toBe(4);
    expect(longestDayRun(["2027-02-28", "2027-03-01"])).toBe(2);
  });
  it("ignore une date illisible", () => {
    expect(longestDayRun(["nope", "2026-11-01", "2026-11-02"])).toBe(2);
  });
});
