import { describe, expect, it } from "vitest";
import { directLotItems, directLotName, directRewardsSchema } from "./direct-send";
import { MAX_LOT_QUANTITY, MAX_LOT_ZENI } from "./lots";

describe("envoi direct à tous les inscrits", () => {
  it("refuse un envoi vide", () => {
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: null, card: null }).success).toBe(false);
  });

  it("accepte des Zeni seuls, un booster seul ou une carte seule", () => {
    expect(directRewardsSchema.safeParse({ zeni: 1000, booster: null, card: null }).success).toBe(true);
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: { boosterTypeId: "legendaire", quantity: 1 }, card: null }).success).toBe(true);
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: null, card: { cardId: "c1", quantity: 2 } }).success).toBe(true);
  });

  it("borne les Zeni et les quantités", () => {
    expect(directRewardsSchema.safeParse({ zeni: MAX_LOT_ZENI + 1, booster: null, card: null }).success).toBe(false);
    expect(directRewardsSchema.safeParse({ zeni: -1, booster: { boosterTypeId: "b", quantity: 1 }, card: null }).success).toBe(false);
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: { boosterTypeId: "b", quantity: MAX_LOT_QUANTITY + 1 }, card: null }).success).toBe(false);
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: null, card: { cardId: "c", quantity: 0 } }).success).toBe(false);
    expect(directRewardsSchema.safeParse({ zeni: 1.5, booster: null, card: null }).success).toBe(false);
  });

  it("refuse les champs inconnus et les ids douteux", () => {
    expect(directRewardsSchema.safeParse({ zeni: 10, booster: null, card: null, audience: "ALL" }).success).toBe(false);
    expect(directRewardsSchema.safeParse({ zeni: 0, booster: { boosterTypeId: "x'; DROP", quantity: 1 }, card: null }).success).toBe(false);
  });

  it("traduit les récompenses en éléments de lot", () => {
    expect(directLotItems({ zeni: 1000, booster: { boosterTypeId: "legendaire", quantity: 1 }, card: { cardId: "c1", quantity: 3 } })).toEqual([
      { kind: "BOOSTER", boosterTypeId: "legendaire", quantity: 1 },
      { kind: "CARD", cardId: "c1", quantity: 3 },
    ]);
    expect(directLotItems({ zeni: 1000, booster: null, card: null })).toEqual([]);
  });

  it("nomme le lot avec la date d'envoi", () => {
    expect(directLotName(new Date("2026-10-26T09:05:42Z"))).toEqual({ fr: "Envoi direct · 2026-10-26 09:05 UTC", en: "Direct send · 2026-10-26 09:05 UTC" });
  });
});
