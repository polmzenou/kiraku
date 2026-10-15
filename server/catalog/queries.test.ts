import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWikiParams, WIKI_SORTS } from "@/lib/catalog/wiki-params";

const mocks = vi.hoisted(() => ({ cards: vi.fn(), series: vi.fn(), version: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("../db", () => ({
  prisma: {
    card: { findMany: mocks.cards },
    series: { findMany: mocks.series },
    catalogImport: { findFirst: mocks.version },
  },
}));

import { getCatalogFilterOptions, getCatalogSearchIndex } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.version.mockResolvedValue(null);
  mocks.cards.mockResolvedValue([]);
  mocks.series.mockResolvedValue([]);
});

describe("filtres et tri publics du wiki", () => {
  it("combine série, démographie, genre, sexe, raretés et recherche avant la pagination", async () => {
    await getCatalogSearchIndex(parseWikiParams({
      q: "Éren Titan", rarity: "RARE,EPIC", series: "series-a", demographic: "Shounen", genre: "Action", gender: "Male",
    }));
    expect(mocks.cards).toHaveBeenCalledWith({
      where: {
        rank: { not: null }, rarity: { in: ["RARE", "EPIC"] }, seriesId: "series-a",
        series: { tags: { has: "Shounen" }, genres: { has: "Action" } }, gender: "Male",
        AND: [{ searchText: { contains: "eren" } }, { searchText: { contains: "titan" } }],
      },
      orderBy: [{ rank: "asc" }], select: { anilistId: true },
    });
  });

  it("trie dans les deux sens avec un rang unique pour départager les égalités", async () => {
    for (const sort of WIKI_SORTS) {
      for (const dir of ["asc", "desc"] as const) {
        await getCatalogSearchIndex(parseWikiParams({ sort, dir }));
        expect(mocks.cards).toHaveBeenLastCalledWith(expect.objectContaining({
          orderBy: sort === "number" ? [{ rank: dir }] : [{ [sort]: dir }, { rank: "asc" }],
        }));
      }
    }
  });

  it("attribue des curseurs selon le tri et ne met aucune possession en cache", async () => {
    mocks.cards.mockResolvedValue([{ anilistId: 90 }, { anilistId: 3 }, { anilistId: 45 }]);
    expect(await getCatalogSearchIndex(parseWikiParams({ sort: "name", ownership: "owned", after: "48" }))).toEqual([[90, 1], [3, 2], [45, 3]]);
    expect(mocks.cards).toHaveBeenCalledWith(expect.objectContaining({ where: { rank: { not: null }, AND: [] } }));
  });

  it("permet de trouver les personnages dont le sexe est absent", async () => {
    await getCatalogSearchIndex(parseWikiParams({ gender: "unknown" }));
    expect(mocks.cards).toHaveBeenCalledWith(expect.objectContaining({ where: {
      rank: { not: null }, AND: [], OR: [{ gender: null }, { gender: "" }],
    } }));
  });

  it("traduit et classe les séries, déduplique les genres du catalogue actif", async () => {
    mocks.series.mockResolvedValue([
      { id: "z", titleRomaji: "Zulu", titleEnglish: "Alpha", genres: ["Action", "Comedy"], _count: { cards: 2 } },
      { id: "a", titleRomaji: "Alpha", titleEnglish: "Zulu", genres: ["Action", "Drama"], _count: { cards: 3 } },
    ]);
    expect(await getCatalogFilterOptions("fr")).toEqual({
      series: [{ id: "a", title: "Alpha", cards: 3 }, { id: "z", title: "Zulu", cards: 2 }], genres: ["Action", "Comedy", "Drama"],
    });
    expect((await getCatalogFilterOptions("en")).series[0]).toEqual({ id: "z", title: "Alpha", cards: 2 });
    expect(mocks.series).toHaveBeenCalledWith(expect.objectContaining({ where: { cards: { some: { rank: { not: null } } } } }));
  });
});
