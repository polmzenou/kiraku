import { z } from "@/lib/zod";

// Paramètres de la liste /admin/catalogue (URL partageable, sans JS requis).

export const ADMIN_CATALOG_SORTS = ["updated", "name", "rarity", "power", "number"] as const;
export const ADMIN_CATALOG_KINDS = ["", "bases", "variants"] as const;
export const ADMIN_CATALOG_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const text = (max: number) => z.string().trim().max(max).catch("");
const schema = z.object({
  q: text(200), rarity: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/).catch(""), series: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).catch(""),
  status: z.enum(ADMIN_CATALOG_STATUSES).or(z.literal("")).catch(""), origin: z.enum(["ANILIST", "CUSTOM"]).or(z.literal("")).catch(""),
  kind: z.enum(ADMIN_CATALOG_KINDS).catch(""), sort: z.enum(ADMIN_CATALOG_SORTS).catch("updated"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
export type AdminCatalogParams = z.infer<typeof schema>;

export function parseAdminCatalogParams(raw: Record<string, string | string[] | undefined>): AdminCatalogParams {
  const one = (key: string) => (typeof raw[key] === "string" ? raw[key] : undefined);
  return schema.parse({ q: one("q") ?? "", rarity: one("rarity") ?? "", series: one("series") ?? "", status: one("status") ?? "",
    origin: one("origin") ?? "", kind: one("kind") ?? "", sort: one("sort") ?? "updated", page: one("page") ?? 1 });
}

/** URL de la liste en ne gardant que les paramètres utiles. */
export function adminCatalogHref(params: AdminCatalogParams, patch: Partial<AdminCatalogParams> = {}) {
  const next = { ...params, page: 1, ...patch };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value === "" || (key === "sort" && value === "updated") || (key === "page" && value === 1)) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/admin/catalogue${query ? `?${query}` : ""}`;
}

/** Résultat de /api/admin/catalogue/search. */
export type SearchOption = { id: string; label: string; detail?: string; imageUrl?: string };
