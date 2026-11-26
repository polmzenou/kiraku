import { describe, expect, it } from "vitest";
import { boxPacks, CHANCE_ROWS, chanceRows, wishlistInPool } from "./panel";

describe("sachets d'un jūbako", () => {
  it("planchers de la boîte divisés par ceux du sachet standard", () => {
    expect(boxPacks(20, 4)).toBe(5);
    expect(boxPacks(30, 4)).toBe(8);
    expect(boxPacks(20, 5)).toBe(4);
  });

  it("au moins un sachet, même pour une petite boîte ou un réglage vide", () => {
    expect(boxPacks(1, 4)).toBe(1);
    expect(boxPacks(0, 4)).toBe(1);
    expect(boxPacks(6, 0)).toBe(6);
  });
});

describe("souhaits dans un booster", () => {
  const pool = { COMMON: ["a", "b"], RARE: ["c"], MYTHIC: [] };

  it("compte les souhaits présents dans le pool, toutes raretés confondues", () => {
    expect(wishlistInPool(pool, ["a", "c", "z"])).toEqual({ inPool: 2, total: 3 });
  });

  it("ne compte pas deux fois un souhait en double", () => {
    expect(wishlistInPool(pool, ["a", "a"])).toEqual({ inPool: 1, total: 1 });
  });

  it("vaut zéro sans souhait", () => {
    expect(wishlistInPool(pool, [])).toEqual({ inPool: 0, total: 0 });
  });
});

describe("lignes de chances", () => {
  // « Esprit ou mieux » vaut les chances des XR : sans carte Esprit, la ligne serait trompeuse
  const odds = { RARE: 1, EPIC: 0.2, LEGENDARY: 0.03, MYTHIC: 0.008, BR: 0.005, GOLD: 0.001, SR: 0.0001, XR: 0.0001 };

  it("garde toujours les seuils de base", () => {
    expect(chanceRows({ odds, inPool: [] })).toEqual(CHANCE_ROWS);
  });

  it("n'affiche une variante que si le pool en contient au moins une carte publiée", () => {
    expect(chanceRows({ odds, inPool: ["COMMON", "RARE", "BR", "GOLD", "XR"] })).toEqual([...CHANCE_ROWS, "BR", "GOLD", "XR"]);
  });

  it("ignore une variante présente mais sans chance de sortir", () => {
    expect(chanceRows({ odds: { ...odds, GOLD: 0 }, inPool: ["GOLD"] })).toEqual(CHANCE_ROWS);
  });
});
