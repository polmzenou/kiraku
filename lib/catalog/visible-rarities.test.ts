import { describe, expect, it } from "vitest";
import { publishedFromCounts, visibleRarities } from "./visible-rarities";

const ORDER = ["COMMON", "RARE", "MYTHIC", "MR", "SR", "XR"];

describe("raretés proposées dans les filtres", () => {
  it("une rareté sans carte publiée disparaît, l'ordre du registre reste", () => {
    const published = publishedFromCounts(ORDER, { COMMON: 120, RARE: 4, MYTHIC: 1, MR: 0, XR: 2 });
    expect(published).toEqual(["COMMON", "RARE", "MYTHIC", "XR"]);
    expect(visibleRarities(ORDER, published)).toEqual(["COMMON", "RARE", "MYTHIC", "XR"]);
  });
  it("garde une rareté déjà choisie ou possédée, sans doublon ni rareté hors registre", () => {
    expect(visibleRarities(ORDER, ["COMMON", "XR"], ["SR", "XR", "INCONNUE"])).toEqual(["COMMON", "SR", "XR"]);
  });
  it("sans liste des publiées, propose tout le registre", () => {
    expect(visibleRarities(ORDER, null, ["SR"])).toEqual(ORDER);
  });
  it("dès qu'une Esprit est publiée, elle rejoint les filtres", () => {
    expect(visibleRarities(ORDER, publishedFromCounts(ORDER, { COMMON: 1 }))).not.toContain("SR");
    expect(visibleRarities(ORDER, publishedFromCounts(ORDER, { COMMON: 1, SR: 1 }))).toContain("SR");
  });
});
