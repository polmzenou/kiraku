import { describe, expect, it } from "vitest";
import { seededFloat, seededRng } from "./rng";

describe("générateurs à graine (mulberry32)", () => {
  it("flottants dans [0, 1), même suite pour une même graine", () => {
    const a = seededFloat(42);
    const b = seededFloat(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seededFloat(43)()).not.toBe(values[0]);
  });

  it("suite connue (les effets du casino rejouent comme avant la mise en commun)", () => {
    const next = seededFloat(1);
    expect(next()).toBeCloseTo(0.6270739405881613, 12);
    expect(next()).toBeCloseTo(0.002735721180215478, 12);
  });

  it("les entiers suivent la même suite que les flottants", () => {
    const floats = seededFloat(7);
    const ints = seededRng(7);
    for (let i = 0; i < 100; i++) expect(ints(1000)).toBe(Math.floor(floats() * 1000));
  });
});
