import { describe, expect, it } from "vitest";
import { suggestTeam, type PoolCard } from "./team";

const pool: PoolCard[] = [
  { cardId: "xr", tier: 8, rank: 1 },
  { cardId: "gold", tier: 7, rank: 5 },
  { cardId: "mythic-top", tier: 5, rank: 10 },
  { cardId: "mythic-low", tier: 5, rank: 190 },
  { cardId: "rare", tier: 2, rank: 3000 },
  { cardId: "common-top", tier: 0, rank: 4000 },
  { cardId: "common-low", tier: 0, rank: 6500 },
];

describe("équipes proposées", () => {
  it("optimale : les cartes les plus rares", () => {
    expect(suggestTeam(pool, 5, "best")).toEqual(["xr", "gold", "mythic-top"]);
  });

  it("économe : la carte la plus proche de la rareté exigée et deux cartes courantes", () => {
    expect(suggestTeam(pool, 5, "thrifty")).toEqual(["mythic-low", "common-low", "common-top"]);
    expect(suggestTeam(pool, 8, "thrifty")).toEqual(["xr", "common-low", "common-top"]);
  });

  it("refuse quand la condition ou l'effectif manquent", () => {
    expect(suggestTeam(pool.filter((c) => c.tier < 8), 8, "best")).toBeNull();
    expect(suggestTeam(pool.slice(0, 2), 0, "best")).toBeNull();
    // Doublons de la réserve ignorés
    expect(suggestTeam([pool[0], pool[0], pool[1]], 0, "best")).toBeNull();
  });
});
