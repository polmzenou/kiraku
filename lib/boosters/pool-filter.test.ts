import { describe, expect, it } from "vitest";
import {
  dayKey,
  filterContext,
  isDynamicFilter,
  matchesFilter,
  parsePoolFilter,
  seasonOf,
  type FilterContext,
  type PoolCandidate,
} from "./pool-filter";

const card = (over: Partial<PoolCandidate> = {}): PoolCandidate => ({
  id: "c1",
  anilistId: 4004,
  rarity: "RARE",
  gender: "Female",
  role: "MAIN",
  birthMonth: 10,
  birthDay: 14,
  seriesAnilistId: 21,
  mediaType: "ANIME",
  genres: ["Action", "Comedy"],
  tags: ["Shounen", "Isekai"],
  year: 2019,
  season: "FALL",
  seasonYear: 2026,
  studio: "MAPPA",
  ...over,
});

const ctx: FilterContext = { year: 2026, month: 10, day: 14, season: "FALL", seasonYear: 2026 };

describe("matchesFilter", () => {
  it("sélectionne les personnages par leur identifiant AniList, sans prendre les autres de la série", () => {
    expect(matchesFilter(card(), { anilistIds: [4004, 12055] }, ctx)).toBe(true);
    expect(matchesFilter(card({ anilistId: 4003 }), { anilistIds: [4004, 12055] }, ctx)).toBe(false);
    expect(parsePoolFilter({ anilistIds: [] })).toBeNull();
    expect(parsePoolFilter({ anilistIds: [-1] })).toBeNull();
  });
  it("un filtre vide garde tout", () => {
    expect(matchesFilter(card(), {}, ctx)).toBe(true);
  });

  it("tags et genres : au moins un en commun", () => {
    expect(matchesFilter(card(), { tags: ["Seinen", "Shounen"] }, ctx)).toBe(true);
    expect(matchesFilter(card(), { tags: ["Seinen"] }, ctx)).toBe(false);
    expect(matchesFilter(card(), { genres: ["Comedy"] }, ctx)).toBe(true);
    expect(matchesFilter(card(), { genres: ["Horror"] }, ctx)).toBe(false);
  });

  it("genre du personnage : ceux sans genre sont exclus de Waifus et Husbandos", () => {
    expect(matchesFilter(card(), { gender: "Female" }, ctx)).toBe(true);
    expect(matchesFilter(card({ gender: null }), { gender: "Female" }, ctx)).toBe(false);
    expect(matchesFilter(card({ gender: null }), { gender: "Male" }, ctx)).toBe(false);
  });

  it("rôle, type de média, studio", () => {
    expect(matchesFilter(card(), { role: "SUPPORTING" }, ctx)).toBe(false);
    expect(matchesFilter(card(), { mediaType: "MANGA" }, ctx)).toBe(false);
    expect(matchesFilter(card(), { studio: "MAPPA" }, ctx)).toBe(true);
  });

  it("époque : bornes incluses, année inconnue exclue", () => {
    expect(matchesFilter(card({ year: 1999 }), { yearMax: 1999 }, ctx)).toBe(true);
    expect(matchesFilter(card({ year: 2000 }), { yearMax: 1999 }, ctx)).toBe(false);
    expect(matchesFilter(card({ year: 2018 }), { yearMin: 2018 }, ctx)).toBe(true);
    expect(matchesFilter(card({ year: null }), { yearMin: 2018 }, ctx)).toBe(false);
  });

  it("anniversaires et saison en cours dépendent du jour", () => {
    expect(matchesFilter(card(), { birthdayToday: true }, ctx)).toBe(true);
    expect(matchesFilter(card({ birthDay: 15 }), { birthdayToday: true }, ctx)).toBe(false);
    expect(matchesFilter(card(), { currentSeason: true }, ctx)).toBe(true);
    expect(matchesFilter(card({ seasonYear: 2025 }), { currentSeason: true }, ctx)).toBe(false);
  });

  it("œuvres et cartes précises", () => {
    expect(matchesFilter(card(), { seriesIds: [21] }, ctx)).toBe(true);
    expect(matchesFilter(card(), { cardIds: ["autre"] }, ctx)).toBe(false);
  });
});

describe("saisons et jour", () => {
  it("suit le découpage AniList (décembre = hiver de l'année suivante)", () => {
    expect(seasonOf(2026, 12)).toEqual({ season: "WINTER", seasonYear: 2027 });
    expect(seasonOf(2027, 2)).toEqual({ season: "WINTER", seasonYear: 2027 });
    expect(seasonOf(2026, 3)).toEqual({ season: "SPRING", seasonYear: 2026 });
    expect(seasonOf(2026, 8)).toEqual({ season: "SUMMER", seasonYear: 2026 });
    expect(seasonOf(2026, 10)).toEqual({ season: "FALL", seasonYear: 2026 });
  });

  it("calcule le jour dans le fuseau du jeu", () => {
    // 22 h 30 UTC le 13 = 00 h 30 le 14 à Paris
    const now = new Date("2026-10-13T22:30:00Z");
    expect(dayKey(filterContext(now, "Europe/Paris"))).toBe("2026-10-14");
    expect(dayKey(filterContext(now, "UTC"))).toBe("2026-10-13");
  });

  it("repère les filtres qui changent chaque jour", () => {
    expect(isDynamicFilter({ birthdayToday: true })).toBe(true);
    expect(isDynamicFilter({ currentSeason: true })).toBe(true);
    expect(isDynamicFilter({ genres: ["Sports"] })).toBe(false);
  });
});

describe("parsePoolFilter", () => {
  it("refuse les champs inconnus et les bornes inversées", () => {
    expect(parsePoolFilter({ tags: ["Shounen"] })).toEqual({ tags: ["Shounen"] });
    expect(parsePoolFilter({ sql: "DROP TABLE" })).toBeNull();
    expect(parsePoolFilter({ yearMin: 2010, yearMax: 2000 })).toBeNull();
    expect(parsePoolFilter(null)).toEqual({});
  });
});
