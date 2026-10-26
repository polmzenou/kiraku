import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { normalizeCharacter } from "./anilist";
import { rawCharacter } from "./fixtures";
import {
  parseIdList,
  parseRarityOverrides,
  placeNewCharacters,
  selectNewCharacters,
  type CatalogCard,
  type MediaCharacter,
  type MediaRole,
} from "./media-import";

const thresholds = SETTING_DEFAULTS["catalog.rarityThresholds"];
const stats = SETTING_DEFAULTS["catalog.stats"];
const KNOWN = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD"];

function character(id: number, favourites: number, mediaRole: MediaRole | null = "SUPPORTING"): MediaCharacter {
  const n = normalizeCharacter(rawCharacter({ id, favourites }), 60);
  if (!n.ok) throw new Error("fixture invalide");
  return { character: n.character, mediaRole };
}

/** Catalogue de 100 cartes classées : rang i a 1000 − i favoris. */
function catalog(): CatalogCard[] {
  return Array.from({ length: 100 }, (_, i) => ({
    anilistId: i + 1,
    favorites: 1000 - (i + 1),
    rank: i + 1,
    rarity: i < 3 ? "MYTHIC" : i < 10 ? "LEGENDARY" : "COMMON",
    power: 100 - i,
    ki: 50 + i,
  }));
}

const all = { ids: [], roles: ["MAIN", "SUPPORTING"] as MediaRole[], minFavorites: 0, limit: null };

describe("parseRarityOverrides / parseIdList", () => {
  it("lit les paires id=RARETÉ, insensible à la casse", () => {
    expect(parseRarityOverrides("402683=mythic, 402555=LEGENDARY", KNOWN)).toEqual(new Map([[402683, "MYTHIC"], [402555, "LEGENDARY"]]));
    expect(parseRarityOverrides(undefined, KNOWN)).toEqual(new Map());
  });

  it("refuse une rareté inconnue ou un id invalide", () => {
    expect(parseRarityOverrides("1=SUPER", KNOWN)).toBeNull();
    expect(parseRarityOverrides("abc=RARE", KNOWN)).toBeNull();
    expect(parseRarityOverrides("12", KNOWN)).toBeNull();
  });

  it("lit une liste d'ids et dédoublonne", () => {
    expect(parseIdList("3, 1,3")).toEqual([3, 1]);
    expect(parseIdList("")).toEqual([]);
    expect(parseIdList("1,x")).toBeNull();
  });
});

describe("selectNewCharacters", () => {
  it("n'ajoute jamais un personnage déjà en base, même archivé", () => {
    const { kept, skipped } = selectNewCharacters([character(1, 50), character(2, 40)], new Set([1]), all);
    expect(kept.map((c) => c.character.anilistId)).toEqual([2]);
    expect(skipped).toEqual([{ anilistId: 1, name: "Personnage 1", reason: "existing" }]);
  });

  it("filtre rôles, favoris et nombre, par favoris décroissants", () => {
    const chars = [character(1, 5), character(2, 90, "BACKGROUND"), character(3, 70, "MAIN"), character(4, 60), character(5, 50)];
    const { kept, skipped } = selectNewCharacters(chars, new Set(), { ...all, minFavorites: 10, limit: 2 });
    expect(kept.map((c) => c.character.anilistId)).toEqual([3, 4]);
    expect(Object.fromEntries(skipped.map((s) => [s.anilistId, s.reason]))).toEqual({ 1: "favorites", 2: "role", 5: "limit" });
  });

  it("les ids demandés passent outre rôle et favoris, et signalent ceux introuvables", () => {
    const chars = [character(1, 0, "BACKGROUND"), character(2, 90)];
    const { kept, missingIds } = selectNewCharacters(chars, new Set(), { ...all, ids: [1, 99], minFavorites: 10 });
    expect(kept.map((c) => c.character.anilistId)).toEqual([1]);
    expect(missingIds).toEqual([99]);
  });

  it("ignore un doublon renvoyé deux fois par AniList", () => {
    const { kept } = selectNewCharacters([character(7, 10), character(7, 10)], new Set(), all);
    expect(kept).toHaveLength(1);
  });
});

describe("placeNewCharacters", () => {
  it("déduit la rareté des favoris sans reclasser le catalogue, rangs à la suite", () => {
    const entries = placeNewCharacters([character(500, 998), character(501, 1)], catalog(), { thresholds, stats, forced: new Map() });
    // 998 favoris : seul le rang 1 (999) est devant → rang virtuel 2 sur 102 → Mythique
    expect(entries[0]).toMatchObject({ rank: 101, rarity: "MYTHIC", forced: false });
    // 1 favori : derrière tout le monde → Commune
    expect(entries[1]).toMatchObject({ rank: 102, rarity: "COMMON", forced: false });
    expect(entries[0].power).toBeGreaterThan(entries[1].power);
  });

  it("rareté imposée : stats médianes des cartes de cette rareté", () => {
    const [entry] = placeNewCharacters([character(500, 1)], catalog(), { thresholds, stats, forced: new Map([[500, "MYTHIC"]]) });
    // Mythiques du catalogue : power 100, 99, 98 · ki 50, 51, 52
    expect(entry).toMatchObject({ rarity: "MYTHIC", power: 99, ki: 51, forced: true });
  });

  it("rareté imposée sans carte de référence : stats du rang virtuel", () => {
    const [entry] = placeNewCharacters([character(500, 1)], catalog(), { thresholds, stats, forced: new Map([[500, "GOLD"]]) });
    const [auto] = placeNewCharacters([character(500, 1)], catalog(), { thresholds, stats, forced: new Map() });
    expect(entry).toMatchObject({ rarity: "GOLD", power: auto.power, ki: auto.ki });
  });

  it("fonctionne sur un catalogue vide", () => {
    const entries = placeNewCharacters([character(1, 10), character(2, 5)], [], { thresholds, stats, forced: new Map() });
    expect(entries.map((e) => e.rank)).toEqual([1, 2]);
  });
});
