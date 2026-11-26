import { describe, expect, it } from "vitest";
import { endedTooEarly } from "./anti-farm";

describe("endedTooEarly", () => {
  it("abandon ou minuteur avant le tour minimal : sans gain", () => {
    expect(endedTooEarly({ turn: 1, endReason: "FORFEIT" }, 3)).toBe(true);
    expect(endedTooEarly({ turn: 2, endReason: "TIMEOUT" }, 3)).toBe(true);
  });

  it("à partir du tour minimal, abandon et minuteur rapportent", () => {
    expect(endedTooEarly({ turn: 3, endReason: "FORFEIT" }, 3)).toBe(false);
    expect(endedTooEarly({ turn: 4, endReason: "TIMEOUT" }, 3)).toBe(false);
  });

  it("un K.-O. ou la limite de tours comptent toujours, même tôt", () => {
    expect(endedTooEarly({ turn: 2, endReason: "KO" }, 3)).toBe(false);
    expect(endedTooEarly({ turn: 2, endReason: "TURN_LIMIT" }, 3)).toBe(false);
  });

  it("seuil réglable : 1 coupe l'anti-farm, un seuil plus haut l'étend", () => {
    expect(endedTooEarly({ turn: 1, endReason: "FORFEIT" }, 1)).toBe(false);
    expect(endedTooEarly({ turn: 5, endReason: "FORFEIT" }, 6)).toBe(true);
  });
});
