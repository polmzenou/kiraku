import { describe, expect, it } from "vitest";
import { alertsLeft, checkOrder, compareOrders, orderExpiresAt, orderNet, orderOpen, shouldAlert } from "./buy-orders";

const rules = { minStartPrice: 10, maxPrice: 100_000, maxPriceByRarity: { COMMON: 500 } };

describe("avis de recherche", () => {
  it("borne le prix comme une mise en vente, plafond de la rareté compris", () => {
    expect(checkOrder(10, rules, "EPIC")).toBeNull();
    expect(checkOrder(100_000, rules, "EPIC")).toBeNull();
    expect(checkOrder(9, rules, "EPIC")).toBe("INVALID_PRICE");
    expect(checkOrder(12.5, rules, "EPIC")).toBe("INVALID_PRICE");
    expect(checkOrder(Number.NaN, rules, "EPIC")).toBe("INVALID_PRICE");
    expect(checkOrder(100_001, rules, "EPIC")).toBe("CAP_REACHED");
    expect(checkOrder(500, rules, "COMMON")).toBeNull();
    expect(checkOrder(501, rules, "COMMON")).toBe("CAP_REACHED");
  });

  it("expire après la durée réglée, même avant le passage du cron", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const expiresAt = orderExpiresAt(now, 7);
    expect(expiresAt.toISOString()).toBe("2026-11-25T12:00:00.000Z");
    expect(orderOpen({ status: "OPEN", expiresAt }, now)).toBe(true);
    expect(orderOpen({ status: "OPEN", expiresAt }, expiresAt)).toBe(false);
    expect(orderOpen({ status: "FILLED", expiresAt }, now)).toBe(false);
  });

  it("sert l'offre la plus haute, puis la plus ancienne à prix égal", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 18, h));
    const orders = [
      { id: "c", price: 100, createdAt: at(3) },
      { id: "b", price: 120, createdAt: at(5) },
      { id: "a", price: 100, createdAt: at(1) },
      { id: "d", price: 100, createdAt: at(1) },
    ];
    expect([...orders].sort(compareOrders).map((o) => o.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("ne prévient les détenteurs qu'au-dessus de la cote, ou sans cote", () => {
    expect(shouldAlert(100, null)).toBe(true);
    expect(shouldAlert(101, 100)).toBe(true);
    expect(shouldAlert(100, 100)).toBe(false);
    expect(shouldAlert(80, 100)).toBe(false);
  });

  it("sans cote, compare à la référence de la rareté quand le réglage le demande", () => {
    // La cote de la carte passe avant la référence
    expect(shouldAlert(150, 200, { reference: 100 })).toBe(false);
    expect(shouldAlert(101, null, { reference: 100 })).toBe(true);
    expect(shouldAlert(100, null, { reference: 100 })).toBe(false);
    // Ni cote ni référence : personne n'est prévenu
    expect(shouldAlert(1_000_000, null, { reference: null })).toBe(false);
  });

  it("plafonne les alertes d'un acheteur sur 24 h (0 : sans plafond)", () => {
    expect(alertsLeft(0, 5_000)).toBe(Number.POSITIVE_INFINITY);
    expect(alertsLeft(50, 20)).toBe(30);
    expect(alertsLeft(50, 50)).toBe(0);
    expect(alertsLeft(50, 70)).toBe(0);
  });

  it("paie le vendeur moins la taxe figée", () => {
    expect(orderNet(1000, 500)).toBe(950);
    expect(orderNet(1, 500)).toBe(0);
  });
});
