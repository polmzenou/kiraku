import { describe, expect, it } from "vitest";
import { parseWikiParams, wikiQuery } from "./wiki-params";

describe("paramètres du wiki", () => {
  it("lit une recherche, une rareté et un curseur valides", () => {
    expect(parseWikiParams({ q: "  Satoru GOJOU ", rarity: "MYTHIC", after: "48" })).toEqual({
      q: "Satoru GOJOU",
      terms: ["satoru", "gojou"],
      rarity: "MYTHIC",
      after: 48,
      ownership: "all",
    });
  });

  it("ignore chaque valeur invalide sans faire échouer la page", () => {
    expect(parseWikiParams({ q: "%_'; DROP", rarity: "SUPER", after: "-3" })).toEqual({
      q: "%_'; DROP",
      terms: ["drop"],
      rarity: null,
      after: null,
      ownership: "all",
    });
    expect(parseWikiParams({ q: "x".repeat(500), after: "1.5" })).toMatchObject({ q: "", after: null });
  });

  it("prend la première valeur d'un paramètre répété et limite le nombre de mots", () => {
    expect(parseWikiParams({ rarity: ["RARE", "EPIC"] }).rarity).toBe("RARE");
    expect(parseWikiParams({ q: "a b c d e f g" }).terms).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("construit des liens sans valeurs vides", () => {
    expect(wikiQuery({ q: "", rarity: "EPIC", after: null })).toEqual({ rarity: "EPIC" });
    expect(wikiQuery({ q: "levi", after: 96 })).toEqual({ q: "levi", after: "96" });
    expect(wikiQuery({ q: "levi", rarity: "MYTHIC", ownership: "owned", after: 96 })).toEqual({ q: "levi", rarity: "MYTHIC", ownership: "owned", after: "96" });
    expect(wikiQuery({ ownership: "all" })).toEqual({});
  });

  it("valide le filtre de possession et les paramètres répétés", () => {
    expect(parseWikiParams({ ownership: "owned" }).ownership).toBe("owned");
    expect(parseWikiParams({ ownership: ["missing", "owned"] }).ownership).toBe("missing");
    expect(parseWikiParams({ ownership: "other" }).ownership).toBe("all");
  });
});
