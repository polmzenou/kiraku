import { describe, expect, it } from "vitest";
import { normalizeShowcase, placeInSlot, slotAtPoint, swapSlots } from "./showcase";

describe("vitrine", () => {
  it("complète les cases vides", () => {
    expect(normalizeShowcase(["a"], 4)).toEqual(["a", null, null, null]);
  });

  it("refuse une vitrine trop longue ou une carte en double", () => {
    expect(normalizeShowcase(["a", "b", "c", "d", "e"], 4)).toBeNull();
    expect(normalizeShowcase(["a", null, "a"], 4)).toBeNull();
  });

  it("échange deux cases, y compris avec une case vide", () => {
    expect(swapSlots(["a", "b", null, "d"], 0, 2)).toEqual([null, "b", "a", "d"]);
    expect(swapSlots(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("déplace une carte déjà en vitrine au lieu de la dupliquer", () => {
    expect(placeInSlot(["a", "b", null, null], 3, "a")).toEqual([null, "b", null, "a"]);
    expect(placeInSlot(["a", "b"], 1, null)).toEqual(["a", null]);
  });

  it("trouve la case sous le doigt, sinon la plus proche", () => {
    const rects = [0, 1, 2, 3].map((i) => ({ left: i * 100, top: 0, width: 90, height: 120 }));
    expect(slotAtPoint(150, 60, rects)).toBe(1);
    expect(slotAtPoint(97, 60, rects)).toBe(1); // dans l'espace entre deux cases
    expect(slotAtPoint(380, 400, rects)).toBe(3);
    expect(slotAtPoint(0, 0, [])).toBe(-1);
  });
});
