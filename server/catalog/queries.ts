import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { countByRarity, RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { WikiParams } from "@/lib/catalog/wiki-params";
import { emptyWikiCollection, selectWikiPage, type CatalogSearchIndex } from "@/lib/catalog/wiki-state";
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
  return last?.finishedAt?.getTime() ?? 0;
});

const summarySelect = {
  anilistId: true,
  name: true,
  nameNative: true,
  imageUrl: true,
  rank: true,
  rarity: true,
  power: true,
  ki: true,
  series: { select: { titleRomaji: true, titleEnglish: true } },
} satisfies Prisma.CardSelect;

export type CatalogCardSummary = Prisma.CardGetPayload<{ select: typeof summarySelect }>;

const detailSelect = {
  ...summarySelect,
  id: true,
  favorites: true,
  role: true,
  seriesId: true,
  series: { select: { titleRomaji: true, titleEnglish: true, titleNative: true, type: true } },
} satisfies Prisma.CardSelect;

export type CatalogCardDetail = Prisma.CardGetPayload<{ select: typeof detailSelect }>;

// `_version` ne sert qu'à la clé de cache (unstable_cache y inclut les arguments)
const loadStats = unstable_cache(
  async (_version: number) => {
    void _version; // Part of the cache key.
    const groups = await prisma.card.groupBy({
      by: ["rarity"],
      where: { rank: { not: null } },
      _count: { _all: true },
    });
    const byRarity = countByRarity([]);
    for (const g of groups) byRarity[g.rarity as Rarity] = g._count._all;
    const total = RARITIES.reduce((sum, r) => sum + byRarity[r], 0);
    return { total, byRarity };
  },
  ["catalog-stats"],
  cacheOptions,
);

const loadCard = unstable_cache(
  async (anilistId: number, _version: number): Promise<CatalogCardDetail | null> => {
    void _version;
    return prisma.card.findUnique({ where: { anilistId }, select: detailSelect });
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
  async (terms: string[], rarity: Rarity | null, _version: number): Promise<CatalogSearchIndex> => {
    void _version;
    const rows = await prisma.card.findMany({
      where: {
        rank: { not: null },
        ...(rarity && { rarity }),
        AND: terms.map((term) => ({ searchText: { contains: term } })),
      },
      orderBy: { rank: "asc" },
      select: { anilistId: true, rank: true },
    });
    return rows.map((r) => [r.anilistId, r.rank!] as const);
  },
  ["catalog-search-index"],
  cacheOptions,
);

const loadSummaries = unstable_cache(
  async (ids: number[], _version: number): Promise<CatalogCardSummary[]> => {
    void _version;
    return prisma.card.findMany({ where: { anilistId: { in: ids } }, select: summarySelect });
  },
  ["catalog-summaries"],
  cacheOptions,
);

const loadRelated = unstable_cache(
  async (seriesId: string, exclude: number, _version: number): Promise<CatalogCardSummary[]> => {
    void _version;
    return prisma.card.findMany({
      where: { seriesId, rank: { not: null }, anilistId: { not: exclude } },
      orderBy: { rank: "asc" },
      take: 6,
      select: summarySelect,
    });
  },
  ["catalog-related"],
  cacheOptions,
);

export async function getCatalogSearchIndex({ terms, rarity }: Pick<WikiParams, "terms" | "rarity">) {
  return loadSearchIndex(terms, rarity, await getCatalogVersion());
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
export async function searchCatalog(params: Pick<WikiParams, "terms" | "rarity" | "after">) {
  const index = await getCatalogSearchIndex(params);
  const page = selectWikiPage(index, { after: params.after, ownership: "all" }, emptyWikiCollection());
  return { cards: await getCatalogSummaries(page.ids), nextAfter: page.nextAfter };
}
