import { describe, expect, it } from "vitest";
import { openingGestureProgress, startOpeningGesture } from "./opening-gesture";

const rect = { left: 100, width: 240, height: 336 };

describe("booster opening gestures", () => {
  it("cuts from left to right without opening on a tap or a tiny movement", () => {
    const gesture = startOpeningGesture(110, 50, rect, false);
    expect(gesture.direction).toBe(1);
    expect(openingGestureProgress(gesture, 110, 50)).toBe(0);
    expect(openingGestureProgress(gesture, 115, 50)).toBeLessThan(0.05);
    expect(openingGestureProgress(gesture, 330, 55)).toBe(1);
  });

  it("cuts from right to left with the same progress", () => {
    const left = startOpeningGesture(110, 50, rect, false);
    const right = startOpeningGesture(330, 50, rect, false);
    expect(right.direction).toBe(-1);
    expect(openingGestureProgress(right, 210, 50)).toBe(openingGestureProgress(left, 230, 50));
    expect(openingGestureProgress(right, 110, 50)).toBe(1);
  });

  it("can finish a cut started near the middle of the strip", () => {
    const gesture = startOpeningGesture(210, 50, rect, false);
    expect(openingGestureProgress(gesture, 335, 50)).toBe(1);
  });

  it("ignores vertical swipes and movements toward the wrong edge", () => {
    const gesture = startOpeningGesture(110, 50, rect, false);
    expect(openingGestureProgress(gesture, 120, 180)).toBe(0);
    expect(openingGestureProgress(gesture, 100, 50)).toBe(0);
  });

  it("lifts envelopes and boxes upward without responding to horizontal or downward swipes", () => {
    const gesture = startOpeningGesture(220, 200, rect, true);
    expect(openingGestureProgress(gesture, 220, 40)).toBe(1);
    expect(openingGestureProgress(gesture, 50, 200)).toBe(0);
    expect(openingGestureProgress(gesture, 220, 300)).toBe(0);
  });

  it("keeps progress finite for a temporarily collapsed target", () => {
    const gesture = startOpeningGesture(100, 50, { left: 100, width: 0, height: 0 }, false);
    expect(openingGestureProgress(gesture, 110, 50)).toBe(1);
    expect(openingGestureProgress(gesture, 100, 50)).toBe(0);
  });
});
