import { z } from "@/lib/zod";
import { RARITIES, type Rarity } from "../catalog/rarity";
import { SEARCH_MAX_LENGTH } from "../catalog/search";

// Vue « Albums » de la collection : une tuile par série, avec la progression par rareté.
// Les paramètres vivent dans l'URL, comme ceux de la vue Cartes.

export const ALBUM_PAGE_SIZE = 60;
export const ALBUM_MAX_OFFSET = 5_000;

export const ALBUM_SORTS = ["most", "progress", "az"] as const;
export type AlbumSort = (typeof ALBUM_SORTS)[number];

export type AlbumParams = {
  q: string;
  sort: AlbumSort;
  /** false : seulement les albums commencés ; true : tout le catalogue. */
  all: boolean;
};

export const DEFAULT_ALBUM_PARAMS: AlbumParams = { q: "", sort: "most", all: false };

export type AlbumProgress = Record<Rarity, { owned: number; total: number }>;

export type Album = {
  seriesId: string;
  title: string;
  cover: string | null;
  owned: number;
  total: number;
  byRarity: AlbumProgress;
};

export type AlbumPage = { items: Album[]; total: number; nextOffset: number | null };

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** La collection s'affiche-t-elle en albums (`?vue=albums`) ? */
export function isAlbumView(raw: Raw): boolean {
  return first(raw.vue) === "albums";
}

/** Paramètres d'URL des albums ; une valeur invalide est ignorée. */
export function parseAlbumParams(raw: Raw): AlbumParams {
  const q = z.string().max(SEARCH_MAX_LENGTH * 2).safeParse(first(raw.q) ?? "");
  const sort = z.enum(ALBUM_SORTS).safeParse(first(raw.tri));
  return {
    q: q.success ? q.data.trim().slice(0, SEARCH_MAX_LENGTH) : "",
    sort: sort.success ? sort.data : DEFAULT_ALBUM_PARAMS.sort,
    all: first(raw.tous) === "1",
  };
}

/** Requête d'URL courte (sans les valeurs par défaut), vue Albums comprise. */
export function albumQuery(params: Partial<AlbumParams>): Record<string, string> {
  const query: Record<string, string> = { vue: "albums" };
  if (params.q) query.q = params.q;
  if (params.sort && params.sort !== DEFAULT_ALBUM_PARAMS.sort) query.tri = params.sort;
  if (params.all) query.tous = "1";
  return query;
}

/** Part de l'album possédée, de 0 à 1. */
export function albumRatio(album: Pick<Album, "owned" | "total">): number {
  return album.total > 0 ? album.owned / album.total : 0;
}

/** Raretés présentes dans l'album, de la plus courante à la plus rare. */
export function albumRarities(byRarity: AlbumProgress, order: readonly string[] = RARITIES): Rarity[] {
  return [...order, ...Object.keys(byRarity).filter((r) => !order.includes(r))].filter((r) => (byRarity[r]?.total ?? 0) > 0);
}

/** Motif ILIKE d'une recherche libre : `%` et `_` du joueur sont pris au pied de la lettre. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
