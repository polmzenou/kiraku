import { z } from "zod";
import { RARITIES, type Rarity } from "./rarity";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "./search";

export const WIKI_PAGE_SIZE = 48;
export const WIKI_OWNERSHIPS = ["all", "owned", "missing"] as const;
export type WikiOwnership = (typeof WIKI_OWNERSHIPS)[number];
const MAX_TERMS = 5;

export type WikiParams = { q: string; terms: string[]; rarity: Rarity | null; after: number | null; ownership: WikiOwnership };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const qSchema = z.string().max(SEARCH_MAX_LENGTH * 2);
const raritySchema = z.enum(RARITIES);
const afterSchema = z.coerce.number().int().positive().max(1_000_000);
const ownershipSchema = z.enum(WIKI_OWNERSHIPS);

/** Paramètres d'URL du wiki ; une valeur invalide est simplement ignorée. */
export function parseWikiParams(raw: Record<string, string | string[] | undefined>): WikiParams {
  const qRaw = qSchema.safeParse(first(raw.q) ?? "");
  const q = qRaw.success ? qRaw.data.trim().slice(0, SEARCH_MAX_LENGTH) : "";
  const terms = normalizeSearch(q).split(" ").filter(Boolean).slice(0, MAX_TERMS);
  const rarity = raritySchema.safeParse(first(raw.rarity));
  const after = afterSchema.safeParse(first(raw.after));
  const ownership = ownershipSchema.safeParse(first(raw.ownership));
  return { q, terms, rarity: rarity.success ? rarity.data : null, after: after.success ? after.data : null, ownership: ownership.success ? ownership.data : "all" };
}

/** Paramètres de lien (sans les valeurs vides), pour garder recherche et filtre d'une page à l'autre. */
export function wikiQuery(params: { q?: string; rarity?: Rarity | null; after?: number | null; ownership?: WikiOwnership }) {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.rarity) query.rarity = params.rarity;
  if (params.after) query.after = String(params.after);
  if (params.ownership && params.ownership !== "all") query.ownership = params.ownership;
  return query;
}
