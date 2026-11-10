import { describe, expect, it } from "vitest";
import { parseSpoilerMode } from "./spoiler";

describe("parseSpoilerMode", () => {
  it("garde un mode connu", () => {
    expect(parseSpoilerMode("hide")).toBe("hide");
    expect(parseSpoilerMode("show")).toBe("show");
  });

  it("retombe sur « tout afficher » sinon", () => {
    expect(parseSpoilerMode(undefined)).toBe("show");
    expect(parseSpoilerMode(null)).toBe("show");
    expect(parseSpoilerMode("blur")).toBe("show");
    expect(parseSpoilerMode("HIDE")).toBe("show");
  });
});
