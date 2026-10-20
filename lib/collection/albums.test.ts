import { describe, expect, it } from "vitest";
import { albumQuery, albumRarities, albumRatio, DEFAULT_ALBUM_PARAMS, isAlbumView, likePattern, parseAlbumParams } from "./albums";

const progress = (entries: Partial<Record<string, [number, number]>>) =>
  Object.fromEntries(
    ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].map((r) => {
      const [owned, total] = entries[r] ?? [0, 0];
      return [r, { owned, total }];
    }),
  ) as Parameters<typeof albumRarities>[0];

describe("paramètres des albums", () => {
  it("reconnaît la vue Albums", () => {
    expect(isAlbumView({ vue: "albums" })).toBe(true);
    expect(isAlbumView({ vue: "cartes" })).toBe(false);
    expect(isAlbumView({})).toBe(false);
  });

  it("garde les défauts pour des valeurs invalides", () => {
    expect(parseAlbumParams({ tri: "nope", tous: "oui" })).toEqual(DEFAULT_ALBUM_PARAMS);
  });

  it("lit tri, recherche et portée", () => {
    expect(parseAlbumParams({ q: "  One Piece ", tri: "progress", tous: "1" })).toEqual({ q: "One Piece", sort: "progress", all: true });
  });

  it("produit une URL courte et relisible", () => {
    expect(albumQuery(DEFAULT_ALBUM_PARAMS)).toEqual({ vue: "albums" });
    const query = albumQuery({ q: "naruto", sort: "az", all: true });
    expect(parseAlbumParams(query)).toEqual({ q: "naruto", sort: "az", all: true });
  });
});

describe("progression d'un album", () => {
  it("calcule la part possédée", () => {
    expect(albumRatio({ owned: 2, total: 8 })).toBe(0.25);
    expect(albumRatio({ owned: 0, total: 0 })).toBe(0);
  });

  it("ne liste que les raretés présentes, dans l'ordre", () => {
    expect(albumRarities(progress({ MYTHIC: [0, 1], COMMON: [1, 3] }))).toEqual(["COMMON", "MYTHIC"]);
  });
});

describe("motif de recherche", () => {
  it("échappe les jokers SQL", () => {
    expect(likePattern("100%_ok")).toBe("%100\\%\\_ok%");
  });
});
