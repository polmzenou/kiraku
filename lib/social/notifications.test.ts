import { describe, expect, it } from "vitest";
import { formatBadge, parseCoinFlipPayload, parseGiftPayload, parseTeamGiftPayload } from "./notifications";

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

describe("parseCoinFlipPayload", () => {
  it("garde la table, la carte et une raison connue", () => {
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1", reason: "EXPIRED" })).toEqual({ flipId: "t1", cardId: "c1", reason: "EXPIRED" });
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1" })).toEqual({ flipId: "t1", cardId: "c1", reason: null });
    expect(parseCoinFlipPayload({ flipId: "t1", cardId: "c1", reason: "WON" })).toEqual({ flipId: "t1", cardId: "c1", reason: null });
  });

  it("refuse une forme inconnue", () => {
    expect(parseCoinFlipPayload(null)).toBeNull();
    expect(parseCoinFlipPayload({ flipId: "t 1", cardId: "c1" })).toBeNull();
    expect(parseCoinFlipPayload({ flipId: "t1" })).toBeNull();
  });
});

describe("parseTeamGiftPayload", () => {
  it("lit les cadeaux de l'équipe, Encens compris, et refuse une quantité invalide", () => {
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: 2 })).toEqual({ kind: "INCENSE", quantity: 2 });
    expect(parseTeamGiftPayload({ kind: "BOOSTER", boosterTypeId: "t1", quantity: 1 })).toEqual({ kind: "BOOSTER", boosterTypeId: "t1", quantity: 1 });
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: 0 })).toBeNull();
    expect(parseTeamGiftPayload({ kind: "INCENSE", quantity: "3" })).toBeNull();
    expect(parseTeamGiftPayload({ kind: "OTHER", quantity: 1 })).toBeNull();
  });
});
