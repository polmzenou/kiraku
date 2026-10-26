import { describe, expect, it } from "vitest";
import { classifySwipe, dragOffset, exitDuration, isSwipeRoot, lockAxis, swipeNeighbor } from "./swipe-nav";

describe("swipeNeighbor", () => {
  it("suit l'ordre de la capsule", () => {
    expect(swipeNeighbor("/", "next")).toBe("/collection");
    expect(swipeNeighbor("/collection", "next")).toBe("/combat");
    expect(swipeNeighbor("/combat", "next")).toBe("/marche");
    expect(swipeNeighbor("/marche", "prev")).toBe("/combat");
    expect(swipeNeighbor("/collection", "prev")).toBe("/");
  });

  it("ne boucle pas aux bouts", () => {
    expect(swipeNeighbor("/", "prev")).toBeNull();
    expect(swipeNeighbor("/marche", "next")).toBeNull();
  });

  it("ignore les sous-pages et les autres pages", () => {
    expect(swipeNeighbor("/marche/abc", "prev")).toBeNull();
    expect(swipeNeighbor("/combat/42", "next")).toBeNull();
    expect(swipeNeighbor("/ouvrir/classique", "next")).toBeNull();
    expect(swipeNeighbor("/missions", "next")).toBeNull();
    expect(isSwipeRoot("/collection/123")).toBe(false);
    expect(isSwipeRoot("/collection")).toBe(true);
  });
});

describe("lockAxis", () => {
  it("attend le seuil avant de trancher", () => {
    expect(lockAxis(4, 3)).toBeNull();
    expect(lockAxis(14, 3)).toBe("x");
    expect(lockAxis(-3, 14)).toBe("y");
  });
});

describe("classifySwipe", () => {
  const width = 375;

  it("valide un long glissement lent", () => {
    expect(classifySwipe({ dx: -130, dy: 10, velocity: -0.1, width })).toBe("next");
    expect(classifySwipe({ dx: 130, dy: -10, velocity: 0, width })).toBe("prev");
  });

  it("valide un geste vif même court", () => {
    expect(classifySwipe({ dx: -60, dy: 5, velocity: -0.9, width })).toBe("next");
  });

  it("refuse un glissement lent trop court", () => {
    expect(classifySwipe({ dx: -60, dy: 5, velocity: -0.1, width })).toBeNull();
  });

  it("refuse un geste vertical ou en diagonale", () => {
    expect(classifySwipe({ dx: -150, dy: 120, velocity: -1, width })).toBeNull();
    expect(classifySwipe({ dx: 10, dy: 300, velocity: 0, width })).toBeNull();
  });

  it("refuse un geste vif trop petit", () => {
    expect(classifySwipe({ dx: -30, dy: 0, velocity: -1.5, width })).toBeNull();
  });

  it("annule un long glissement relancé dans l'autre sens", () => {
    expect(classifySwipe({ dx: -200, dy: 0, velocity: 0.8, width })).toBeNull();
  });
});

describe("exitDuration", () => {
  it("suit la vitesse du doigt dans des bornes", () => {
    expect(exitDuration(200, -2)).toBe(140);
    expect(exitDuration(300, -1.5)).toBe(200);
    expect(exitDuration(600, 0)).toBe(260);
  });
});

describe("dragOffset", () => {
  it("suit le doigt quand un voisin existe", () => {
    expect(dragOffset(-120, true)).toBe(-120);
  });

  it("résiste au bout de la liste", () => {
    const offset = dragOffset(300, false);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(40);
    expect(dragOffset(-300, false)).toBeCloseTo(-offset);
  });
});
