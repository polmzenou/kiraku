import { z } from "@/lib/zod";
import { RARITIES, type Rarity } from "./rarity";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "./search";

export const WIKI_PAGE_SIZE = 48;
export const WIKI_OWNERSHIPS = ["all", "owned", "missing"] as const;
export type WikiOwnership = (typeof WIKI_OWNERSHIPS)[number];
export const WIKI_SORTS = ["number", "rarity", "name", "power", "ki", "favorites"] as const;
export type WikiSort = (typeof WIKI_SORTS)[number];
export const WIKI_DEMOGRAPHICS = ["Shounen", "Seinen", "Shoujo", "Josei", "Kids"] as const;
export const WIKI_GENDERS = ["Male", "Female", "Non-binary", "unknown"] as const;
export const WIKI_DEFAULT_DIR: Record<WikiSort, "asc" | "desc"> = {
  number: "asc",
  rarity: "desc",
  name: "asc",
  power: "desc",
  ki: "desc",
  favorites: "desc",
};
const MAX_TERMS = 5;

export type WikiParams = {
  q: string;
  terms: string[];
  rarities: Rarity[];
  after: number | null;
  ownership: WikiOwnership;
  series: string | null;
  demographic: (typeof WIKI_DEMOGRAPHICS)[number] | null;
  genre: string | null;
  gender: (typeof WIKI_GENDERS)[number] | null;
  sort: WikiSort;
  dir: "asc" | "desc";
};

export type WikiCatalogParams = Pick<WikiParams, "terms" | "rarities" | "series" | "demographic" | "genre" | "gender" | "sort" | "dir">;
export type WikiFilterOptions = {
  series: { id: string; title: string; cards: number }[];
  genres: string[];
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const qSchema = z.string().max(SEARCH_MAX_LENGTH * 2);
const raritySchema = z.enum(RARITIES);
const afterSchema = z.coerce.number().int().positive().max(1_000_000);
const ownershipSchema = z.enum(WIKI_OWNERSHIPS);
const seriesSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const demographicSchema = z.enum(WIKI_DEMOGRAPHICS);
const genreSchema = z.string().trim().min(1).max(60);
const genderSchema = z.enum(WIKI_GENDERS);
const sortSchema = z.enum(WIKI_SORTS);
const dirSchema = z.enum(["asc", "desc"]);

/** Paramètres d'URL du wiki ; une valeur invalide est simplement ignorée. */
export function parseWikiParams(raw: Record<string, string | string[] | undefined>): WikiParams {
  const qRaw = qSchema.safeParse(first(raw.q) ?? "");
  const q = qRaw.success ? qRaw.data.trim().slice(0, SEARCH_MAX_LENGTH) : "";
  const terms = normalizeSearch(q).split(" ").filter(Boolean).slice(0, MAX_TERMS);
  const wanted = new Set(
    (first(raw.rarity) ?? "").split(",").flatMap((value) => {
      const rarity = raritySchema.safeParse(value.trim());
      return rarity.success ? [rarity.data] : [];
    }),
  );
  const after = afterSchema.safeParse(first(raw.after));
  const ownership = ownershipSchema.safeParse(first(raw.ownership));
  const series = seriesSchema.safeParse(first(raw.series));
  const demographic = demographicSchema.safeParse(first(raw.demographic));
  const genre = genreSchema.safeParse(first(raw.genre));
  const gender = genderSchema.safeParse(first(raw.gender));
  const sort = sortSchema.safeParse(first(raw.sort));
  const sortValue = sort.success ? sort.data : "number";
  const dir = dirSchema.safeParse(first(raw.dir));
  return {
    q,
    terms,
    rarities: RARITIES.filter((rarity) => wanted.has(rarity)),
    after: after.success ? after.data : null,
    ownership: ownership.success ? ownership.data : "all",
    series: series.success ? series.data : null,
    demographic: demographic.success ? demographic.data : null,
    genre: genre.success ? genre.data : null,
    gender: gender.success ? gender.data : null,
    sort: sortValue,
    dir: dir.success ? dir.data : WIKI_DEFAULT_DIR[sortValue],
  };
}

/** Paramètres de lien (sans les valeurs vides), pour garder recherche et filtre d'une page à l'autre. */
export function wikiQuery(params: Partial<WikiParams>) {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.rarities?.length) query.rarity = params.rarities.join(",");
  if (params.after) query.after = String(params.after);
  if (params.ownership && params.ownership !== "all") query.ownership = params.ownership;
  if (params.series) query.series = params.series;
  if (params.demographic) query.demographic = params.demographic;
  if (params.genre) query.genre = params.genre;
  if (params.gender) query.gender = params.gender;
  const sort = params.sort ?? "number";
  if (sort !== "number") query.sort = sort;
  if (params.dir && params.dir !== WIKI_DEFAULT_DIR[sort]) query.dir = params.dir;
  return query;
}
