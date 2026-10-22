import { describe, expect, it } from "vitest";
import { wishlistInPool } from "./panel";

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
