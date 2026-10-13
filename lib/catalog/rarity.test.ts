import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { countByRarity, rankCatalog, rarityForRank, statsFor, type Rarity } from "./rarity";

const thresholds = SETTING_DEFAULTS["catalog.rarityThresholds"];
const stats = SETTING_DEFAULTS["catalog.stats"];

function distribution(total: number) {
  return countByRarity(Array.from({ length: total }, (_, i) => ({ rarity: rarityForRank(i + 1, total, thresholds) })));
}

describe("rarityForRank", () => {
  it("place les bornes exactes du catalogue complet", () => {
    // 3 % de 6 736 = 202,08 → les rangs 1 à 202 sont Mythiques
    expect(rarityForRank(202, 6736, thresholds)).toBe("MYTHIC");
    expect(rarityForRank(203, 6736, thresholds)).toBe("LEGENDARY");
    expect(rarityForRank(673, 6736, thresholds)).toBe("LEGENDARY");
    expect(rarityForRank(674, 6736, thresholds)).toBe("EPIC");
    expect(rarityForRank(6736, 6736, thresholds)).toBe("COMMON");
  });

  it("donne la répartition attendue pour 200 et 6 736 cartes", () => {
    expect(distribution(200)).toEqual({ MYTHIC: 6, LEGENDARY: 14, EPIC: 30, RARE: 50, UNCOMMON: 50, COMMON: 50 });
    expect(distribution(6736)).toEqual({ MYTHIC: 202, LEGENDARY: 471, EPIC: 1011, RARE: 1684, UNCOMMON: 1684, COMMON: 1684 });
  });

  it("tombe du bon côté sur une borne pile (pas d'erreur de flottant)", () => {
    expect(rarityForRank(3, 100, thresholds)).toBe("MYTHIC");
    expect(rarityForRank(10, 100, thresholds)).toBe("LEGENDARY");
    expect(rarityForRank(75, 100, thresholds)).toBe("UNCOMMON");
  });
});

describe("statsFor", () => {
  it("donne des stats hautes au n° 1 et basses en bas du catalogue", () => {
    expect(statsFor(1, 6736, stats)).toEqual({ power: 100, ki: 85 });
    expect(statsFor(6736, 6736, stats)).toEqual({ power: 40, ki: 30 });
  });

  it("fait baisser les stats avec le rang", () => {
    const a = statsFor(100, 6736, stats);
    const b = statsFor(3000, 6736, stats);
    expect(a.power).toBeGreaterThan(b.power);
    expect(a.ki).toBeGreaterThan(b.ki);
  });
});

describe("rankCatalog", () => {
  const row = (anilistId: number, favorites: number, position: number) => ({ anilistId, favorites, position });
  const base = { thresholds, stats, policy: "LIVE" as const, existingRarity: new Map<number, Rarity>() };

  it("trie par favoris, départage par position AniList puis par id", () => {
    const ranked = rankCatalog([row(3, 50, 2), row(1, 90, 5), row(2, 50, 1), row(4, 50, 1)], { ...base, target: 10 });
    expect(ranked.map((r) => r.anilistId)).toEqual([1, 2, 4, 3]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("dédoublonne en gardant la ligne la plus récente (plus de favoris)", () => {
    const ranked = rankCatalog([row(1, 10, 0), row(2, 20, 1), row(1, 30, 60)], { ...base, target: 10 });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({ anilistId: 1, favorites: 30, rank: 1 });
  });

  it("garde seulement les `target` premiers et calcule le percentile sur eux", () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(i + 1, 1000 - i, i));
    const ranked = rankCatalog(rows, { ...base, target: 200 });
    expect(ranked).toHaveLength(200);
    expect(countByRarity(ranked).MYTHIC).toBe(6);
  });

  it("FROZEN garde la rareté d'une carte déjà connue, LIVE la recalcule", () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i + 1, 1000 - i, i));
    const existingRarity = new Map<number, Rarity>([[1, "COMMON"], [100, "MYTHIC"]]);
    const frozen = rankCatalog(rows, { ...base, target: 100, policy: "FROZEN", existingRarity });
    expect(frozen[0].rarity).toBe("COMMON");
    expect(frozen[99].rarity).toBe("MYTHIC");
    expect(frozen[1].rarity).toBe("MYTHIC"); // nouvelle carte : rareté de son percentile
    const live = rankCatalog(rows, { ...base, target: 100, existingRarity });
    expect([live[0].rarity, live[99].rarity]).toEqual(["MYTHIC", "COMMON"]);
  });
});
