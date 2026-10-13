// Personnages AniList bruts pour les tests (forme réelle de la réponse, données inventées).

type RawOverrides = {
  id: number;
  favourites?: number;
  name?: string | null;
  native?: string | null;
  image?: string | null;
  media?: unknown;
};

export function rawMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: 1000,
    type: "ANIME",
    isAdult: false,
    title: { romaji: "Kiraku no Monogatari", english: "Kiraku Story", native: "気楽の物語" },
    genres: ["Action", "Comedy"],
    tags: [
      { name: "Shounen", rank: 90 },
      { name: "Super Power", rank: 60 },
      { name: "Primarily Teen Cast", rank: 59 },
    ],
    startDate: { year: 2020 },
    season: "SPRING",
    seasonYear: 2020,
    studios: { nodes: [{ name: "Studio Washi" }] },
    ...overrides,
  };
}

export function rawCharacter({ id, favourites = 100, name, native, image, media }: RawOverrides) {
  return {
    id,
    favourites,
    gender: "Female",
    dateOfBirth: { month: 4, day: 12 },
    name: { full: name === undefined ? `Personnage ${id}` : name, native: native === undefined ? "人物" : native },
    image: { large: image === undefined ? `https://s4.anilist.co/file/anilistcdn/character/large/b${id}.png` : image },
    media: media === undefined ? { edges: [{ characterRole: "MAIN", node: rawMedia() }] } : media,
  };
}

/** Page de réponse GraphQL AniList. */
export function rawPage(characters: unknown[], hasNextPage: boolean) {
  return { data: { Page: { pageInfo: { hasNextPage }, characters } } };
}
