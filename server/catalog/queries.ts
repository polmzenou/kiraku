import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { countByRarity, type Rarity } from "@/lib/catalog/rarity";
import { seriesTitle } from "@/lib/catalog/display";
import type { WikiCatalogParams, WikiFilterOptions, WikiParams } from "@/lib/catalog/wiki-params";
import { emptyWikiCollection, selectWikiPage, type CatalogSearchIndex } from "@/lib/catalog/wiki-state";
import { getRarities } from "./rarities";
import { prisma } from "../db";

// Lectures du catalogue pour le wiki. La CSP à nonce rend les pages dynamiques : on met en cache
// les données. La clé de cache contient la version du catalogue (fin du dernier import finalisé) :
// un import lancé hors de Next (script) est donc visible tout de suite, sans revalidateTag.
export const CATALOG_TAG = "catalog";
const cacheOptions = { tags: [CATALOG_TAG], revalidate: 3600 };

/** Version du catalogue : une requête indexée par rendu, partagée par toute la page. */
export const getCatalogVersion = cache(async (): Promise<number> => {
  const last = await prisma.catalogImport.findFirst({
    where: { status: "FINALIZED" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  const revision = await prisma.gameSetting.findUnique({ where: { key: "catalog.revision" }, select: { value: true } });
  return Math.max(last?.finishedAt?.getTime() ?? 0, Number(revision?.value) || 0);
});

const summarySelect = {
  anilistId: true,
  publicId: true,
  status: true,
  appearance: true,
  name: true,
  nameNative: true,
  imageUrl: true,
  rank: true,
  rarity: true,
  power: true,
  ki: true,
  formName: true,
  series: { select: { titleRomaji: true, titleEnglish: true } },
} satisfies Prisma.CardSelect;

type SummaryRow = Prisma.CardGetPayload<{ select: typeof summarySelect }>;
export type CatalogCardSummary = Omit<SummaryRow, "anilistId"> & { anilistId: number; sourceAnilistId: number | null };
// Preserve the numeric public view contract used by existing collection clients.
function publicCard<T extends { anilistId: number | null; publicId: number }>(row: T) {
  return { ...row, sourceAnilistId: row.anilistId, anilistId: row.publicId };
}

const detailSelect = {
  ...summarySelect,
  id: true,
  favorites: true,
  description: true,
  role: true,
  seriesId: true,
  series: { select: { titleRomaji: true, titleEnglish: true, titleNative: true, type: true } },
  // Formes liées : la carte de base d'une variante, ou les variantes publiées d'une base.
  variantOf: { select: summarySelect },
  variants: { where: { status: "PUBLISHED" }, orderBy: { publicId: "asc" }, select: summarySelect },
} satisfies Prisma.CardSelect;

export type CatalogCardDetail = Omit<Prisma.CardGetPayload<{ select: typeof detailSelect }>, "anilistId" | "variantOf" | "variants"> & {
  anilistId: number; sourceAnilistId: number | null; variantOf: CatalogCardSummary | null; variants: CatalogCardSummary[];
};

// `_version` ne sert qu'à la clé de cache (unstable_cache y inclut les arguments)
const loadStats = unstable_cache(
  async (_version: number) => {
    void _version; // Part of the cache key.
    const groups = await prisma.card.groupBy({
      by: ["rarity"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    });
    const byRarity = countByRarity([]);
    for (const g of groups) byRarity[g.rarity as Rarity] = g._count._all;
    for (const key of await getRarities()) byRarity[key] ??= 0;
    const total = Object.values(byRarity).reduce((sum, n) => sum + n, 0);
    return { total, byRarity };
  },
  ["catalog-stats"],
  cacheOptions,
);

const loadCard = unstable_cache(
  async (anilistId: number, _version: number): Promise<CatalogCardDetail | null> => {
    void _version;
    const row = await prisma.card.findUnique({ where: { publicId: anilistId, status: { not: "DRAFT" } }, select: detailSelect });
    if (!row) return null;
    const { variantOf, variants, ...card } = row;
    return { ...publicCard(card), variantOf: variantOf && variantOf.status !== "DRAFT" ? publicCard(variantOf) : null, variants: variants.map(publicCard) };
  },
  ["catalog-card"],
  cacheOptions,
);

/** Taille du catalogue actif et nombre de cartes par rareté. */
export async function getCatalogStats() {
  return loadStats(await getCatalogVersion());
}

/** Fiche d'un personnage, y compris s'il est sorti du catalogue (des joueurs peuvent le posséder). */
export async function getCatalogCard(anilistId: number) {
  return loadCard(anilistId, await getCatalogVersion());
}

// Numeric tuples stay below the 2 MB cache-entry limit even at 50,000 characters.
const loadSearchIndex = unstable_cache(
  async (params: WikiCatalogParams, _version: number): Promise<CatalogSearchIndex> => {
    void _version;
    const { terms, rarities, series, demographic, genre, gender, sort, dir } = params;
    const orderBy: Prisma.CardOrderByWithRelationInput[] = [sort === "rarity" ? { rarityDefinition: { sortOrder: dir } } : { [sort === "number" ? "rank" : sort]: dir }];
    // Le rang est unique et départage les égalités pour que la pagination reste stable.
    if (sort !== "number") orderBy.push({ rank: "asc" });
    orderBy.push({ publicId: "asc" });
    const rows = await prisma.card.findMany({
      where: {
        status: "PUBLISHED",
        ...(rarities.length > 0 && { rarity: { in: rarities } }),
        ...(series && { seriesId: series }),
        ...((demographic || genre) && {
          series: {
            ...(demographic && { tags: { has: demographic } }),
            ...(genre && { genres: { has: genre } }),
          },
        }),
        ...(gender && (gender === "unknown" ? { OR: [{ gender: null }, { gender: "" }] } : { gender })),
        AND: terms.map((term) => ({ searchText: { contains: term } })),
      },
      orderBy,
      select: { publicId: true },
    });
    return rows.map((row, index) => [row.publicId, index + 1] as const);
  },
  ["catalog-search-index"],
  cacheOptions,
);

const loadFilterOptions = unstable_cache(
  async (locale: string, _version: number): Promise<WikiFilterOptions> => {
    void _version;
    const rows = await prisma.series.findMany({
      where: { cards: { some: { status: "PUBLISHED" } } },
      select: {
        id: true,
        titleRomaji: true,
        titleEnglish: true,
        genres: true,
        _count: { select: { cards: { where: { status: "PUBLISHED" } } } },
      },
    });
    return {
      series: rows.map((row) => ({ id: row.id, title: seriesTitle(row, locale), cards: row._count.cards }))
        .sort((a, b) => a.title.localeCompare(b.title, locale)),
      genres: [...new Set(rows.flatMap((row) => row.genres))].sort(),
    };
  },
  ["catalog-filter-options"],
  cacheOptions,
);

const loadSummaries = unstable_cache(
  async (ids: number[], _version: number): Promise<CatalogCardSummary[]> => {
    void _version;
    return (await prisma.card.findMany({ where: { publicId: { in: ids }, status: { not: "DRAFT" } }, select: summarySelect })).map(publicCard);
  },
  ["catalog-summaries"],
  cacheOptions,
);

const loadRelated = unstable_cache(
  async (seriesId: string, exclude: number, _version: number): Promise<CatalogCardSummary[]> => {
    void _version;
    return (await prisma.card.findMany({
      where: { seriesId, status: "PUBLISHED", publicId: { not: exclude } },
      orderBy: { rank: "asc" },
      take: 6,
      select: summarySelect,
    })).map(publicCard);
  },
  ["catalog-related"],
  cacheOptions,
);

export async function getCatalogSearchIndex({ terms, rarities, series, demographic, genre, gender, sort, dir }: WikiCatalogParams) {
  return loadSearchIndex({ terms, rarities, series, demographic, genre, gender, sort, dir }, await getCatalogVersion());
}

/** Options publiques, limitées aux séries et genres présents dans le catalogue actif. */
export async function getCatalogFilterOptions(locale: string) {
  return loadFilterOptions(locale, await getCatalogVersion());
}

/** Public summaries only; selected IDs may vary, but no collection data is cached. */
export async function getCatalogSummaries(ids: readonly number[]) {
  if (ids.length === 0) return [];
  const rows = await loadSummaries([...new Set(ids)].sort((a, b) => a - b), await getCatalogVersion());
  const byId = new Map(rows.map((r) => [r.anilistId, r]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

export async function getRelatedCatalogCards(seriesId: string, exclude: number) {
  return loadRelated(seriesId, exclude, await getCatalogVersion());
}

/** Public page, useful as the unpersonalized Suspense fallback. */
export async function searchCatalog(params: WikiCatalogParams & Pick<WikiParams, "after">) {
  const index = await getCatalogSearchIndex(params);
  const page = selectWikiPage(index, { after: params.after, ownership: "all" }, emptyWikiCollection());
  return { cards: await getCatalogSummaries(page.ids), nextAfter: page.nextAfter };
}
