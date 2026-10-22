import { describe, expect, it } from "vitest";
import { collectionQuery, DEFAULT_PARAMS, hasFilters, parseCollectionParams, pickerQuery } from "./params";

describe("paramètres de la collection", () => {
  it("valeurs par défaut sans paramètre", () => {
    expect(parseCollectionParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("lit recherche, raretés, série, doublons et tri", () => {
    const p = parseCollectionParams({ q: " Gojō  Satoru ", rarity: "MYTHIC,EPIC", series: "ckabc123", dupes: "1", sort: "name", dir: "desc" });
    expect(p.terms).toEqual(["gojo", "satoru"]);
    expect(p.rarities).toEqual(["EPIC", "MYTHIC"]);
    expect(p.series).toBe("ckabc123");
    expect(p.dupes).toBe(true);
    expect(p).toMatchObject({ sort: "name", dir: "desc" });
  });

  it("ignore les valeurs invalides", () => {
    const p = parseCollectionParams({ rarity: "GOD,EPIC", series: "'; DROP TABLE", sort: "price", dir: "up", dupes: "yes" });
    expect(p.rarities).toEqual(["EPIC"]);
    expect(p.series).toBeNull();
    expect(p).toMatchObject({ sort: "rarity", dir: "desc", dupes: false });
  });

  it("prend le sens naturel du tri quand dir est absent", () => {
    expect(parseCollectionParams({ sort: "number" }).dir).toBe("asc");
    expect(parseCollectionParams({ sort: "recent" }).dir).toBe("desc");
  });

  it("construit des liens courts et relisibles", () => {
    expect(collectionQuery(DEFAULT_PARAMS)).toEqual({});
    const query = collectionQuery({ q: "luffy", rarities: ["RARE", "EPIC"], dupes: true, sort: "number", dir: "desc" });
    expect(query).toEqual({ q: "luffy", rarity: "RARE,EPIC", dupes: "1", sort: "number", dir: "desc" });
    expect(parseCollectionParams(query)).toMatchObject({ rarities: ["RARE", "EPIC"], dupes: true, sort: "number", dir: "desc" });
  });

  it("détecte les filtres actifs", () => {
    expect(hasFilters(DEFAULT_PARAMS)).toBe(false);
    expect(hasFilters(parseCollectionParams({ dupes: "1" }))).toBe(true);
    expect(hasFilters(parseCollectionParams({ sort: "name" }))).toBe(false);
  });
});

describe("requête d'un sélecteur de cartes", () => {
  it("sans restriction : recherche et raretés cochées", () => {
    expect(pickerQuery("", [])).toEqual({});
    expect(pickerQuery("gojo", ["EPIC", "MYTHIC"])).toEqual({ q: "gojo", rarity: "EPIC,MYTHIC" });
  });

  it("avec raretés autorisées : toutes par défaut, sinon l'intersection", () => {
    expect(pickerQuery("", [], ["COMMON", "RARE"])).toEqual({ rarity: "COMMON,RARE" });
    expect(pickerQuery("", ["RARE", "MYTHIC"], ["COMMON", "RARE"])).toEqual({ rarity: "RARE" });
    // Une case hors des raretés autorisées n'élargit jamais la liste
    expect(pickerQuery("", ["MYTHIC"], ["COMMON"])).toEqual({ rarity: "COMMON" });
  });
});
