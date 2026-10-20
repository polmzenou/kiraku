import { RARITIES, type Rarity } from "../catalog/rarity";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "../catalog/search";

// Filtres, tri et curseur de la page /marche, portés par l'URL (une recherche se partage).
// Pur : server/market/queries.ts traduit ces paramètres en requête Prisma.

export const MARKET_PAGE_SIZE = 24;

export const MARKET_TABS = ["all", "selling", "bidding"] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

/** « Finit bientôt » par défaut, comme le plan. */
export const MARKET_SORTS = ["ending", "newest", "priceAsc", "priceDesc"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export type MarketParams = {
  tab: MarketTab;
  sort: MarketSort;
  rarity: Rarity | null;
  /** Recherche normalisée (nom du personnage ou de la série). */
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  /** Seulement les ventes avec achat immédiat. */
  buyout: boolean;
};

export const DEFAULT_MARKET_PARAMS: MarketParams = {
  tab: "all",
  sort: "ending",
  rarity: null,
  q: "",
  minPrice: null,
  maxPrice: null,
  buyout: false,
};

type RawParams = Record<string, string | string[] | undefined>;

const PRICE_MAX = 100_000_000;

function one(raw: RawParams, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function price(value: string | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= PRICE_MAX ? n : null;
}

/** Paramètres d'URL → filtres valides ; toute valeur inconnue retombe sur le défaut. */
export function parseMarketParams(raw: RawParams, knownRarities: readonly string[] = RARITIES): MarketParams {
  const q = normalizeSearch((one(raw, "q") ?? "").slice(0, SEARCH_MAX_LENGTH));
  let minPrice = price(one(raw, "min"));
  let maxPrice = price(one(raw, "max"));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const rarity = one(raw, "rarete");
  return {
    tab: pick(one(raw, "onglet"), MARKET_TABS, "all"),
    sort: pick(one(raw, "tri"), MARKET_SORTS, "ending"),
    rarity: rarity && knownRarities.includes(rarity) ? (rarity as Rarity) : null,
    q,
    minPrice,
    maxPrice,
    buyout: one(raw, "immediat") === "1",
  };
}

/** Filtres → paramètres d'URL (seulement ce qui diffère du défaut). */
export function marketSearchParams(p: MarketParams): URLSearchParams {
  const s = new URLSearchParams();
  if (p.tab !== "all") s.set("onglet", p.tab);
  if (p.sort !== "ending") s.set("tri", p.sort);
  if (p.rarity) s.set("rarete", p.rarity);
  if (p.q) s.set("q", p.q);
  if (p.minPrice !== null) s.set("min", String(p.minPrice));
  if (p.maxPrice !== null) s.set("max", String(p.maxPrice));
  if (p.buyout) s.set("immediat", "1");
  return s;
}

/** Position dans la liste : valeur de la colonne triée (date en ms ou prix) et id, pour départager. */
export type MarketCursor = { v: number; id: string };

export function encodeMarketCursor(c: MarketCursor): string {
  return Buffer.from(`${c.v}.${c.id}`, "utf8").toString("base64url");
}

export function decodeMarketCursor(raw: string | null | undefined): MarketCursor | null {
  if (!raw || raw.length > 120) return null;
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,40})$/.exec(text);
  return m ? { v: Number(m[1]), id: m[2] } : null;
}
