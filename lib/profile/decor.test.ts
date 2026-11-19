import { describe, expect, it } from "vitest";
import { decorFromColumns, decorFromRelations, NO_DECOR } from "./decor";

describe("décor d'un joueur", () => {
  it("lit le cadre et la couleur portés", () => {
    expect(decorFromRelations({ frame: { frameStyle: "kumo", active: true }, nameColor: { nameColor: "pastel", active: true } })).toEqual({
      frame: "kumo",
      nameColor: "pastel",
      prestige: 0,
    });
  });

  it("lit le prestige : un entier positif, sinon 0", () => {
    expect(decorFromRelations({ prestige: 3 }).prestige).toBe(3);
    expect(decorFromColumns({ prestige: 12 })).toEqual({ ...NO_DECOR, prestige: 12 });
    for (const bad of [0, -1, 2.5, null, undefined]) expect(decorFromColumns({ prestige: bad }).prestige).toBe(0);
  });

  it("ignore un cosmétique désactivé, un style inconnu ou absent", () => {
    expect(decorFromRelations({ frame: { frameStyle: "kumo", active: false }, nameColor: { nameColor: "lime", active: false } })).toEqual(NO_DECOR);
    expect(decorFromRelations({ frame: { frameStyle: "arc-en-ciel", active: true }, nameColor: { nameColor: "or", active: true } })).toEqual(NO_DECOR);
    expect(decorFromRelations({ frame: null, nameColor: null })).toEqual(NO_DECOR);
    expect(decorFromRelations({})).toEqual(NO_DECOR);
  });

  it("lit les colonnes du SQL brut", () => {
    expect(decorFromColumns({ frameStyle: "hoo", nameColor: "rainbow" })).toEqual({ frame: "hoo", nameColor: "rainbow", prestige: 0 });
    expect(decorFromColumns({ frameStyle: null, nameColor: undefined })).toEqual(NO_DECOR);
  });
});
