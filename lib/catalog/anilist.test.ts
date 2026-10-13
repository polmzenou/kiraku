import { describe, expect, it } from "vitest";
import { normalizeCharacter, pageWindow } from "./anilist";
import { rawCharacter, rawMedia } from "./fixtures";

describe("normalizeCharacter", () => {
  it("normalise un personnage complet", () => {
    const result = normalizeCharacter(rawCharacter({ id: 7, favourites: 1234 }), 60);
    expect(result).toEqual({
      ok: true,
      character: {
        anilistId: 7,
        favorites: 1234,
        name: "Personnage 7",
        nameNative: "人物",
        imageUrl: "https://s4.anilist.co/file/anilistcdn/character/large/b7.png",
        gender: "Female",
        birthMonth: 4,
        birthDay: 12,
        role: "MAIN",
        series: {
          anilistId: 1000,
          type: "ANIME",
          titleRomaji: "Kiraku no Monogatari",
          titleEnglish: "Kiraku Story",
          titleNative: "気楽の物語",
          isAdult: false,
          genres: ["Action", "Comedy"],
          tags: ["Shounen", "Super Power"],
          year: 2020,
          season: "SPRING",
          seasonYear: 2020,
          studio: "Studio Washi",
        },
      },
    });
  });

  it("ne garde que les tags au-dessus du rang minimal", () => {
    const result = normalizeCharacter(rawCharacter({ id: 1 }), 80);
    expect(result.ok && result.character.series.tags).toEqual(["Shounen"]);
  });

  it("ignore un personnage sans œuvre", () => {
    expect(normalizeCharacter(rawCharacter({ id: 1, media: { edges: [] } }), 60)).toEqual({ ok: false, reason: "noMedia" });
    expect(normalizeCharacter(rawCharacter({ id: 1, media: null }), 60)).toEqual({ ok: false, reason: "noMedia" });
  });

  it("se rabat sur le nom natif, ignore un personnage sans aucun nom", () => {
    const native = normalizeCharacter(rawCharacter({ id: 1, name: null, native: "五条悟" }), 60);
    expect(native.ok && native.character.name).toBe("五条悟");
    expect(normalizeCharacter(rawCharacter({ id: 1, name: " ", native: null }), 60)).toEqual({ ok: false, reason: "noName" });
  });

  it("refuse une image hors de s4.anilist.co ou en http", () => {
    for (const image of ["https://evil.example/x.png", "http://s4.anilist.co/x.png", null]) {
      expect(normalizeCharacter(rawCharacter({ id: 1, image }), 60)).toEqual({ ok: false, reason: "badImage" });
    }
  });

  it("tolère les champs facultatifs absents ou hors bornes", () => {
    const media = { edges: [{ characterRole: "WEIRD", node: rawMedia({ title: { romaji: "X", english: null, native: null }, season: "AUTUMN", studios: null, tags: null, genres: null, startDate: { year: 99999 } }) }] };
    const raw = { ...rawCharacter({ id: 3, media }), dateOfBirth: { month: 13, day: null }, gender: null };
    const result = normalizeCharacter(raw, 60);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character).toMatchObject({ role: null, gender: null, birthMonth: null, birthDay: null });
    expect(result.character.series).toMatchObject({ titleEnglish: null, season: null, studio: null, tags: [], genres: [], year: null });
  });

  it("rejette une entrée qui n'a pas la forme attendue", () => {
    expect(normalizeCharacter({ id: "abc" }, 60)).toEqual({ ok: false, reason: "invalid" });
    expect(normalizeCharacter(null, 60)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("fenêtres de pagination", () => {
  it("découpe en fenêtres de 5 000 entrées", () => {
    expect(pageWindow(1, 50)).toEqual({ index: 0, localPage: 1, firstPosition: 0 });
    expect(pageWindow(100, 50)).toEqual({ index: 0, localPage: 100, firstPosition: 0 });
    expect(pageWindow(101, 50)).toEqual({ index: 1, localPage: 1, firstPosition: 5000 });
    expect(pageWindow(137, 50)).toEqual({ index: 1, localPage: 37, firstPosition: 5000 });
  });

  it("ne dépasse jamais la profondeur avec une taille de page qui ne divise pas 5 000", () => {
    for (let page = 1; page <= 400; page++) {
      const w = pageWindow(page, 30);
      expect(w.localPage * 30).toBeLessThanOrEqual(5000);
    }
  });
});
