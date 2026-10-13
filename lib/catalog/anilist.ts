import { z } from "zod";

// API GraphQL publique d'AniList (sans clé). Section « Importer le catalogue » du plan.
export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

// AniList refuse toute page au-delà des 5 000 premières entrées d'une liste (HTTP 400,
// « Page depth exceeds maximum allowed »). Au-delà, on ouvre une nouvelle « fenêtre » qui exclut
// (id_not_in) les personnages des fenêtres précédentes : la profondeur repart de zéro.
export const ANILIST_MAX_DEPTH = 5000;

/** Fenêtre et page locale d'une page globale (1, 2, … sans limite). */
export function pageWindow(page: number, perPage: number, maxDepth = ANILIST_MAX_DEPTH) {
  const pagesPerWindow = Math.max(1, Math.floor(maxDepth / perPage));
  const index = Math.floor((page - 1) / pagesPerWindow);
  return {
    index,
    localPage: page - index * pagesPerWindow,
    /** Les personnages des fenêtres précédentes ont une position strictement inférieure. */
    firstPosition: index * pagesPerWindow * perPage,
  };
}

// Tri secondaire par id : les égalités de favoris gardent un ordre stable d'une page à l'autre.
// $exclude est omis dans la première fenêtre (argument absent = aucun filtre).
export const CHARACTERS_QUERY = `query ($page: Int, $perPage: Int, $exclude: [Int]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    characters(sort: [FAVOURITES_DESC, ID], id_not_in: $exclude) {
      id
      favourites
      gender
      dateOfBirth { month day }
      name { full native }
      image { large }
      media(perPage: 1, sort: POPULARITY_DESC) {
        edges {
          characterRole
          node {
            id
            type
            isAdult
            title { romaji english native }
            genres
            tags { name rank }
            startDate { year }
            season
            seasonYear
            studios(isMain: true) { nodes { name } }
          }
        }
      }
    }
  }
}`;

// --- Réponse brute : tout est facultatif, la normalisation décide ---

const rawMediaSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().nullish(),
  isAdult: z.boolean().nullish(),
  title: z.object({ romaji: z.string().nullish(), english: z.string().nullish(), native: z.string().nullish() }).nullish(),
  genres: z.array(z.string().nullish()).nullish(),
  tags: z.array(z.object({ name: z.string(), rank: z.number().nullish() }).nullish()).nullish(),
  startDate: z.object({ year: z.number().int().nullish() }).nullish(),
  season: z.string().nullish(),
  seasonYear: z.number().int().nullish(),
  studios: z.object({ nodes: z.array(z.object({ name: z.string().nullish() }).nullish()).nullish() }).nullish(),
});

const rawCharacterSchema = z.object({
  id: z.number().int().positive(),
  favourites: z.number().int().nullish(),
  gender: z.string().nullish(),
  dateOfBirth: z.object({ month: z.number().int().nullish(), day: z.number().int().nullish() }).nullish(),
  name: z.object({ full: z.string().nullish(), native: z.string().nullish() }).nullish(),
  image: z.object({ large: z.string().nullish() }).nullish(),
  media: z
    .object({
      edges: z.array(z.object({ characterRole: z.string().nullish(), node: rawMediaSchema.nullish() }).nullish()).nullish(),
    })
    .nullish(),
});

export const pageResponseSchema = z.object({
  data: z.object({
    Page: z.object({
      pageInfo: z.object({ hasNextPage: z.boolean().nullish() }).nullish(),
      characters: z.array(z.unknown()),
    }),
  }),
});

// --- Personnage normalisé, stocké dans CatalogImportRow.data ---

const text = (max: number) => z.string().min(1).max(max);
const IMAGE_HOST = "s4.anilist.co"; // seul hôte autorisé par next.config (remotePatterns) et la CSP

export const importedSeriesSchema = z.object({
  anilistId: z.number().int().positive(),
  type: z.enum(["ANIME", "MANGA"]),
  titleRomaji: text(300),
  titleEnglish: text(300).nullable(),
  titleNative: text(300).nullable(),
  isAdult: z.boolean(),
  genres: z.array(text(50)).max(30),
  tags: z.array(text(80)).max(60),
  year: z.number().int().min(1800).max(2200).nullable(),
  season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).nullable(),
  seasonYear: z.number().int().min(1800).max(2200).nullable(),
  studio: text(200).nullable(),
});

export const importedCharacterSchema = z.object({
  anilistId: z.number().int().positive(),
  favorites: z.number().int().min(0),
  name: text(200),
  nameNative: text(200).nullable(),
  imageUrl: z.url({ protocol: /^https$/, hostname: new RegExp(`^${IMAGE_HOST.replaceAll(".", "\\.")}$`) }),
  gender: text(50).nullable(),
  birthMonth: z.number().int().min(1).max(12).nullable(),
  birthDay: z.number().int().min(1).max(31).nullable(),
  role: z.enum(["MAIN", "SUPPORTING", "BACKGROUND"]).nullable(),
  series: importedSeriesSchema,
});

export type ImportedSeries = z.infer<typeof importedSeriesSchema>;
export type ImportedCharacter = z.infer<typeof importedCharacterSchema>;

export type SkipReason = "invalid" | "noMedia" | "noName" | "badImage";
export type NormalizeResult = { ok: true; character: ImportedCharacter } | { ok: false; reason: SkipReason };

/** Chaîne nettoyée, coupée à `max` caractères, ou null si vide. */
function clean(value: string | null | undefined, max: number): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? [...v].slice(0, max).join("") : null;
}

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** Transforme un personnage brut d'AniList en ImportedCharacter, ou explique pourquoi il est ignoré. */
export function normalizeCharacter(raw: unknown, minTagRank: number): NormalizeResult {
  const parsed = rawCharacterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const c = parsed.data;

  const edge = c.media?.edges?.find((e) => e?.node);
  const media = edge?.node;
  const type = oneOf(media?.type, ["ANIME", "MANGA"] as const);
  const titleRomaji = clean(media?.title?.romaji, 300) ?? clean(media?.title?.english, 300);
  if (!media || !type || !titleRomaji) return { ok: false, reason: "noMedia" };

  const name = clean(c.name?.full, 200) ?? clean(c.name?.native, 200);
  if (!name) return { ok: false, reason: "noName" };

  const imageUrl = c.image?.large?.trim();
  const tags = (media.tags ?? [])
    .filter((t): t is { name: string; rank?: number | null } => Boolean(t && (t.rank ?? 0) >= minTagRank))
    .map((t) => clean(t.name, 80))
    .filter((t): t is string => t !== null);
  const genres = (media.genres ?? []).map((g) => clean(g, 50)).filter((g): g is string => g !== null);

  const candidate = {
    anilistId: c.id,
    favorites: Math.max(0, c.favourites ?? 0),
    name,
    nameNative: clean(c.name?.native, 200),
    imageUrl,
    gender: clean(c.gender, 50),
    birthMonth: c.dateOfBirth?.month ?? null,
    birthDay: c.dateOfBirth?.day ?? null,
    role: oneOf(edge?.characterRole, ["MAIN", "SUPPORTING", "BACKGROUND"] as const),
    series: {
      anilistId: media.id,
      type,
      titleRomaji,
      titleEnglish: clean(media.title?.english, 300),
      titleNative: clean(media.title?.native, 300),
      isAdult: media.isAdult ?? false,
      genres: [...new Set(genres)].slice(0, 30),
      tags: [...new Set(tags)].slice(0, 60),
      year: media.startDate?.year ?? null,
      season: oneOf(media.season, ["WINTER", "SPRING", "SUMMER", "FALL"] as const),
      seasonYear: media.seasonYear ?? null,
      studio: clean(media.studios?.nodes?.find((s) => s?.name)?.name, 200),
    },
  };

  const result = importedCharacterSchema.safeParse(candidate);
  if (result.success) return { ok: true, character: result.data };
  const imageIssue = result.error.issues.some((i) => i.path[0] === "imageUrl");
  if (imageIssue) return { ok: false, reason: "badImage" };
  // Une date de naissance ou une année hors bornes ne justifie pas d'écarter le personnage
  const lenient = importedCharacterSchema.safeParse({
    ...candidate,
    birthMonth: null,
    birthDay: null,
    series: { ...candidate.series, year: null, seasonYear: null },
  });
  return lenient.success ? { ok: true, character: lenient.data } : { ok: false, reason: "invalid" };
}
