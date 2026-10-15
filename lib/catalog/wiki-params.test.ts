import { describe, expect, it } from "vitest";
import { parseWikiParams, wikiQuery, WIKI_DEFAULT_DIR, WIKI_SORTS } from "./wiki-params";

const defaults = {
  q: "", terms: [], rarities: [], after: null, ownership: "all",
  series: null, demographic: null, genre: null, gender: null, sort: "number", dir: "asc",
};

describe("paramètres du wiki", () => {
  it("lit une recherche, une rareté et un curseur valides", () => {
    expect(parseWikiParams({ q: "  Satoru GOJOU ", rarity: "MYTHIC", after: "48" })).toEqual({
      ...defaults,
      q: "Satoru GOJOU",
      terms: ["satoru", "gojou"],
      rarities: ["MYTHIC"],
      after: 48,
      ownership: "all",
    });
  });

  it("ignore chaque valeur invalide sans faire échouer la page", () => {
    expect(parseWikiParams({ q: "%_'; DROP", rarity: "SUPER", after: "-3" })).toEqual({
      ...defaults,
      q: "%_'; DROP",
      terms: ["drop"],
      rarities: [],
      after: null,
      ownership: "all",
    });
    expect(parseWikiParams({ q: "x".repeat(500), after: "1.5" })).toMatchObject({ q: "", after: null });
  });

  it("prend la première valeur d'un paramètre répété et limite le nombre de mots", () => {
    expect(parseWikiParams({ rarity: ["RARE", "EPIC"] }).rarities).toEqual(["RARE"]);
    expect(parseWikiParams({ q: "a b c d e f g" }).terms).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("construit des liens sans valeurs vides", () => {
    expect(wikiQuery({ q: "", rarities: ["EPIC"], after: null })).toEqual({ rarity: "EPIC" });
    expect(wikiQuery({ q: "levi", after: 96 })).toEqual({ q: "levi", after: "96" });
    expect(wikiQuery({ q: "levi", rarities: ["MYTHIC"], ownership: "owned", after: 96 })).toEqual({ q: "levi", rarity: "MYTHIC", ownership: "owned", after: "96" });
    expect(wikiQuery({ ownership: "all" })).toEqual({});
  });

  it("valide le filtre de possession et les paramètres répétés", () => {
    expect(parseWikiParams({ ownership: "owned" }).ownership).toBe("owned");
    expect(parseWikiParams({ ownership: ["missing", "owned"] }).ownership).toBe("missing");
    expect(parseWikiParams({ ownership: "other" }).ownership).toBe("all");
  });

  it("combine plusieurs raretés en ignorant les doublons et valeurs inconnues", () => {
    expect(parseWikiParams({ rarity: "MYTHIC,RARE,invalid, EPIC,RARE" }).rarities).toEqual(["RARE", "EPIC", "MYTHIC"]);
  });

  it("conserve tous les filtres et le tri dans les liens de pagination", () => {
    const raw = {
      q: "Levi", rarity: "EPIC,MYTHIC", ownership: "missing", series: "series-1",
      demographic: "Seinen", genre: "Sci-Fi", gender: "Male", sort: "name", dir: "desc", after: "48",
    };
    expect(wikiQuery(parseWikiParams(raw))).toEqual(raw);
    expect(parseWikiParams({ ...raw, after: undefined }).after).toBeNull();
  });

  it("ignore les critères invalides et respecte le sens naturel de chaque tri", () => {
    expect(parseWikiParams({ series: "../bad", demographic: "invalid", genre: "x".repeat(61), gender: "invalid", sort: "invalid", dir: "invalid" })).toEqual(defaults);
    for (const sort of WIKI_SORTS) {
      const params = parseWikiParams({ sort });
      expect(params.dir).toBe(WIKI_DEFAULT_DIR[sort]);
      expect(wikiQuery(params)).toEqual(sort === "number" ? {} : { sort });
      expect(parseWikiParams(wikiQuery({ ...params, dir: "asc" })).dir).toBe("asc");
      expect(parseWikiParams(wikiQuery({ ...params, dir: "desc" })).dir).toBe("desc");
    }
  });
});
