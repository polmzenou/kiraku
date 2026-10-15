import { describe, expect, it } from "vitest";
import {
  decodeMarketCursor,
  DEFAULT_MARKET_PARAMS,
  encodeMarketCursor,
  marketSearchParams,
  parseMarketParams,
} from "./filters";

describe("filtres du marché", () => {
  it("retombe sur les valeurs par défaut", () => {
    expect(parseMarketParams({})).toEqual(DEFAULT_MARKET_PARAMS);
    expect(parseMarketParams({ onglet: "x", tri: "y", rarete: "SUPER", min: "-3", max: "abc" })).toEqual(DEFAULT_MARKET_PARAMS);
  });

  it("lit onglet, tri, rareté, prix et achat immédiat", () => {
    expect(
      parseMarketParams({ onglet: "bidding", tri: "priceDesc", rarete: "MYTHIC", min: "10", max: "500", immediat: "1" }),
    ).toEqual({ tab: "bidding", sort: "priceDesc", rarity: "MYTHIC", q: "", minPrice: 10, maxPrice: 500, buyout: true });
  });

  it("normalise la recherche et remet les prix dans l'ordre", () => {
    const p = parseMarketParams({ q: "  Gojō  SATORU ", min: "900", max: "100" });
    expect(p.q).toBe("gojo satoru");
    expect([p.minPrice, p.maxPrice]).toEqual([100, 900]);
  });

  it("prend la première valeur d'un paramètre répété", () => {
    expect(parseMarketParams({ tri: ["newest", "priceAsc"] }).sort).toBe("newest");
  });

  it("aller-retour par l'URL", () => {
    const p = parseMarketParams({ onglet: "selling", tri: "priceAsc", rarete: "RARE", q: "luffy", min: "5", immediat: "1" });
    expect(parseMarketParams(Object.fromEntries(marketSearchParams(p)))).toEqual(p);
    expect(marketSearchParams(DEFAULT_MARKET_PARAMS).toString()).toBe("");
  });
});

describe("curseur du marché", () => {
  it("aller-retour", () => {
    const c = { v: 1_760_000_000_000, id: "cmabc123" };
    expect(decodeMarketCursor(encodeMarketCursor(c))).toEqual(c);
  });

  it("refuse un curseur forgé", () => {
    expect(decodeMarketCursor(null)).toBeNull();
    expect(decodeMarketCursor("pas-un-curseur")).toBeNull();
    expect(decodeMarketCursor(Buffer.from("1.a'; DROP").toString("base64url"))).toBeNull();
    expect(decodeMarketCursor("x".repeat(500))).toBeNull();
  });
});
