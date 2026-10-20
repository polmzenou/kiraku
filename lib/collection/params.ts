import { rarityKeySchema } from "@/lib/catalog/definitions";
import { z } from "@/lib/zod";
import { RARITIES, type Rarity } from "../catalog/rarity";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "../catalog/search";

// Filtres et tri de la collection, portés par l'URL (un lien de collection filtrée se partage).

export const COLLECTION_PAGE_SIZE = 48;
const MAX_TERMS = 5;

export const COLLECTION_SORTS = ["rarity", "recent", "number", "name", "copies", "power", "ki"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export type SortDir = "asc" | "desc";

/** Sens naturel de chaque tri : le plus intéressant d'abord. */
export const DEFAULT_DIR: Record<CollectionSort, SortDir> = {
  rarity: "desc",
  recent: "desc",
  number: "asc",
  name: "asc",
  copies: "desc",
  power: "desc",
  ki: "desc",
};

export type CollectionParams = {
  q: string;
  terms: string[];
  rarities: Rarity[];
  series: string | null;
  dupes: boolean;
  sort: CollectionSort;
  dir: SortDir;
};

export const DEFAULT_PARAMS: CollectionParams = {
  q: "",
  terms: [],
  rarities: [],
  series: null,
  dupes: false,
  sort: "rarity",
  dir: DEFAULT_DIR.rarity,
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const qSchema = z.string().max(SEARCH_MAX_LENGTH * 2);
const raritySchema = rarityKeySchema;
const seriesSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const sortSchema = z.enum(COLLECTION_SORTS);
const dirSchema = z.enum(["asc", "desc"]);

/** Paramètres d'URL de la collection ; une valeur invalide est simplement ignorée. */
export function parseCollectionParams(raw: Raw, knownRarities: readonly string[] = RARITIES): CollectionParams {
  const qRaw = qSchema.safeParse(first(raw.q) ?? "");
  const q = qRaw.success ? qRaw.data.trim().slice(0, SEARCH_MAX_LENGTH) : "";
  const terms = normalizeSearch(q).split(" ").filter(Boolean).slice(0, MAX_TERMS);

  // rarity=EPIC,MYTHIC : valeurs inconnues ignorées, ordre du plus courant au plus rare
  const wanted = new Set(
    (first(raw.rarity) ?? "")
      .split(",")
      .map((r) => raritySchema.safeParse(r.trim()))
      .flatMap((r) => (r.success ? [r.data] : [])),
  );
  const rarities = knownRarities.filter((r) => wanted.has(r));

  const series = seriesSchema.safeParse(first(raw.series));
  const sort = sortSchema.safeParse(first(raw.sort));
  const sortValue = sort.success ? sort.data : DEFAULT_PARAMS.sort;
  const dir = dirSchema.safeParse(first(raw.dir));

  return {
    q,
    terms,
    rarities,
    series: series.success ? series.data : null,
    dupes: first(raw.dupes) === "1",
    sort: sortValue,
    dir: dir.success ? dir.data : DEFAULT_DIR[sortValue],
  };
}

/** Paramètres de lien sans les valeurs par défaut, pour des URL courtes et stables. */
export function collectionQuery(params: Partial<CollectionParams>): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.rarities && params.rarities.length > 0) query.rarity = params.rarities.join(",");
  if (params.series) query.series = params.series;
  if (params.dupes) query.dupes = "1";
  const sort = params.sort ?? DEFAULT_PARAMS.sort;
  if (sort !== DEFAULT_PARAMS.sort) query.sort = sort;
  if (params.dir && params.dir !== DEFAULT_DIR[sort]) query.dir = params.dir;
  return query;
}

/** Des filtres réduisent-ils la liste (pour l'état vide) ? */
export function hasFilters(params: CollectionParams): boolean {
  return params.terms.length > 0 || params.rarities.length > 0 || params.series !== null || params.dupes;
}
