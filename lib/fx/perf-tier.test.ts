import { describe, expect, it } from "vitest";
import { droppedShare, MIN_FRAMES, readStoredTier, storedTier, tierFromFrames, tierFromHints, TIER_MAX_AGE_MS } from "./perf-tier";

const frames = (n: number, ms: number) => Array.from({ length: n }, () => ms);

describe("niveau d'effets automatique", () => {
  it("ne conclut rien d'une mesure trop courte", () => {
    expect(droppedShare(frames(MIN_FRAMES - 1, 16.7))).toBeNull();
    expect(tierFromFrames([])).toBeNull();
  });

  it("garde les effets complets quand les images arrivent à l'heure, quelle que soit la cadence", () => {
    expect(tierFromFrames(frames(60, 16.7))).toBe("full");
    expect(tierFromFrames(frames(120, 8.3))).toBe("full");
    // iPhone en économie d'énergie : 30 Hz réguliers, ce n'est pas une saccade
    expect(tierFromFrames(frames(30, 33.3).concat(frames(30, 33.4)))).toBe("full");
  });

  it("allège quand plus d'une image sur cinq est en retard", () => {
    const janky = [...frames(40, 16.7), ...frames(20, 50)];
    expect(droppedShare(janky)).toBeCloseTo(1 / 3);
    expect(tierFromFrames(janky)).toBe("lite");
    expect(tierFromFrames([...frames(55, 16.7), ...frames(5, 40)])).toBe("full");
  });

  it("ne juge pas une page bridée par le navigateur (arrière-plan, quelques images par seconde)", () => {
    expect(tierFromFrames([...frames(40, 500), ...frames(20, 900)])).toBeNull();
    expect(tierFromFrames(frames(60, 100))).toBeNull();
  });

  it("ignore les pauses (onglet masqué) et les valeurs absurdes", () => {
    expect(tierFromFrames([...frames(60, 16.7), 5_000, -3, 0])).toBe("full");
  });

  it("n'allège d'emblée que les appareils clairement modestes", () => {
    expect(tierFromHints({ saveData: true })).toBe("lite");
    expect(tierFromHints({ cores: 2 })).toBe("lite");
    expect(tierFromHints({ memory: 1 })).toBe("lite");
    expect(tierFromHints({ cores: 8, memory: 8 })).toBeNull();
    expect(tierFromHints({})).toBeNull();
  });

  it("relit une mesure récente et oublie les anciennes", () => {
    const now = 1_000_000_000_000;
    expect(readStoredTier(storedTier("lite", now - 1_000), now)).toBe("lite");
    expect(readStoredTier(storedTier("full", now - TIER_MAX_AGE_MS - 1), now)).toBeNull();
    expect(readStoredTier("{oops", now)).toBeNull();
    expect(readStoredTier(JSON.stringify({ tier: "ultra", at: now }), now)).toBeNull();
    expect(readStoredTier(null, now)).toBeNull();
  });
});
