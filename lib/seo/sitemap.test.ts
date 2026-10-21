import { describe, expect, it } from "vitest";
import { wikiSitemapCount, wikiSitemapSlice } from "./sitemap";

describe("wikiSitemapCount", () => {
  it("garde un fichier de marge", () => {
    expect(wikiSitemapCount(0, 5)).toBe(1);
    expect(wikiSitemapCount(5, 5)).toBe(2);
    expect(wikiSitemapCount(6, 5)).toBe(3);
  });
});

describe("wikiSitemapSlice", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7];

  it("découpe par blocs", () => {
    expect(wikiSitemapSlice(rows, 0, 3)).toEqual([1, 2, 3]);
    expect(wikiSitemapSlice(rows, 2, 3)).toEqual([7]);
  });

  it("rend une liste vide hors des bornes", () => {
    expect(wikiSitemapSlice(rows, 3, 3)).toEqual([]);
    expect(wikiSitemapSlice(rows, -1, 3)).toEqual([]);
  });
});
