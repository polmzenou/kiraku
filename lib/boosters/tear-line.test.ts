import { describe, expect, it } from "vitest";
import { belowClip, pieceTorn, tearLine, tornRange } from "./tear-line";

describe("booster tear line", () => {
  it("is stable for a seed and spans the whole band around the dashed line", () => {
    const line = tearLine();
    expect(tearLine()).toEqual(line);
    expect(line[0]?.[0]).toBe(0);
    expect(line.at(-1)?.[0]).toBe(100);
    for (const [, y] of line) {
      expect(y).toBeGreaterThanOrEqual(81);
      expect(y).toBeLessThanOrEqual(95);
    }
  });

  it("keeps the band under the tear crimped to the pack", () => {
    expect(belowClip(tearLine(2))).toMatch(/^polygon\(0% [\d.]+%,50% [\d.]+%,100% [\d.]+%,100% 100%,0% 100%\)$/);
  });

  it("tears from the side the finger started on", () => {
    expect(tornRange(0.25, 1)).toEqual({ front: 25, torn: [0, 25] });
    expect(tornRange(0.25, -1)).toEqual({ front: 75, torn: [75, 100] });
    expect(tornRange(2, 1).front).toBe(100);
    expect(tornRange(-1, -1).front).toBe(100);
  });

  it("tears a piece only once the front has fully passed it", () => {
    expect(pieceTorn(0, 1, 0, 10)).toBe(false);
    expect(pieceTorn(0.05, 1, 0, 10)).toBe(false);
    expect(pieceTorn(0.1, 1, 0, 10)).toBe(true);
    expect(pieceTorn(0.1, 1, 10, 20)).toBe(false);
    expect(pieceTorn(0.1, -1, 90, 100)).toBe(true);
    expect(pieceTorn(0.1, -1, 0, 10)).toBe(false);
    expect(pieceTorn(1, -1, 0, 10)).toBe(true);
  });
});
