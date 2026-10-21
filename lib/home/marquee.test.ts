import { describe, expect, it } from "vitest";
import { flingVelocity, relaxVelocity, wrap } from "./marquee";

describe("wrap", () => {
  it("garde une position déjà dans la période", () => {
    expect(wrap(-120, 500)).toBe(-120);
    expect(wrap(0, 500)).toBe(0);
  });
  it("boucle au-delà d'une période, dans les deux sens", () => {
    expect(wrap(-620, 500)).toBe(-120);
    expect(wrap(80, 500)).toBe(-420);
    expect(wrap(-500, 500)).toBe(0);
  });
  it("reste à 0 tant que la piste n'est pas mesurée", () => {
    expect(wrap(-50, 0)).toBe(0);
  });
});

describe("relaxVelocity", () => {
  it("revient vers la vitesse de croisière", () => {
    const v = relaxVelocity(-2000, -40, 0.4, 0.4);
    expect(v).toBeGreaterThan(-2000);
    expect(v).toBeLessThan(-40);
    expect(relaxVelocity(-2000, -40, 10, 0.4)).toBeCloseTo(-40, 3);
  });
  it("ne dépend pas de la cadence d'images", () => {
    let stepped = 900;
    for (let i = 0; i < 10; i++) stepped = relaxVelocity(stepped, -40, 0.016, 0.4);
    expect(stepped).toBeCloseTo(relaxVelocity(900, -40, 0.16, 0.4), 6);
  });
});

describe("flingVelocity", () => {
  it("mesure la vitesse du geste en px/s", () => {
    expect(flingVelocity([{ x: 0, t: 0 }, { x: 50, t: 100 }], 3000)).toBe(500);
  });
  it("borne les lancers trop vifs et ignore un geste immobile", () => {
    expect(flingVelocity([{ x: 0, t: 0 }, { x: -900, t: 50 }], 3000)).toBe(-3000);
    expect(flingVelocity([{ x: 10, t: 5 }], 3000)).toBe(0);
  });
});
