import { describe, expect, it } from "vitest";
import { decorFromColumns, decorFromRelations, NO_DECOR } from "./decor";

describe("décor d'un joueur", () => {
  it("lit le cadre et la couleur portés", () => {
    expect(decorFromRelations({ frame: { frameStyle: "kumo", active: true }, nameColor: { nameColor: "pastel", active: true } })).toEqual({
      frame: "kumo",
      nameColor: "pastel",
    });
  });

  it("ignore un cosmétique désactivé, un style inconnu ou absent", () => {
    expect(decorFromRelations({ frame: { frameStyle: "kumo", active: false }, nameColor: { nameColor: "lime", active: false } })).toEqual(NO_DECOR);
    expect(decorFromRelations({ frame: { frameStyle: "arc-en-ciel", active: true }, nameColor: { nameColor: "or", active: true } })).toEqual(NO_DECOR);
    expect(decorFromRelations({ frame: null, nameColor: null })).toEqual(NO_DECOR);
    expect(decorFromRelations({})).toEqual(NO_DECOR);
  });

  it("lit les colonnes du SQL brut", () => {
    expect(decorFromColumns("hoo", "rainbow")).toEqual({ frame: "hoo", nameColor: "rainbow" });
    expect(decorFromColumns(null, undefined)).toEqual(NO_DECOR);
  });
});
