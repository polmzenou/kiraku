import { describe, expect, it } from "vitest";
import { formatBadge, parseGiftPayload } from "./notifications";

describe("formatBadge", () => {
  it("cache la pastille à zéro et plafonne à 9+", () => {
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(-1)).toBeNull();
    expect(formatBadge(3)).toBe("3");
    expect(formatBadge(9)).toBe("9");
    expect(formatBadge(10)).toBe("9+");
  });
});

describe("parseGiftPayload", () => {
  it("ne garde que des formes connues", () => {
    expect(parseGiftPayload({ kind: "BOOSTER" })).toEqual({ kind: "BOOSTER" });
    expect(parseGiftPayload({ kind: "CARD", cardId: "c1", extra: "<b>" })).toEqual({ kind: "CARD", cardId: "c1" });
    expect(parseGiftPayload({ kind: "CARD" })).toBeNull();
    expect(parseGiftPayload("x")).toBeNull();
  });
});
