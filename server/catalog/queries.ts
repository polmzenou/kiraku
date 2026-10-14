import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { countByRarity, RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { WIKI_PAGE_SIZE, type WikiParams } from "@/lib/catalog/wiki-params";
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
  favorites: true,
  role: true,
  series: { select: { titleRomaji: true, titleEnglish: true, titleNative: true, type: true } },
} satisfies Prisma.CardSelect;

export type CatalogCardDetail = Prisma.CardGetPayload<{ select: typeof detailSelect }>;

// `_version` ne sert qu'à la clé de cache (unstable_cache y inclut les arguments)
const loadStats = unstable_cache(
  async (_version: number) => {
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
  async (anilistId: number, _version: number): Promise<CatalogCardDetail | null> =>
    prisma.card.findUnique({ where: { anilistId }, select: detailSelect }),
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

/** Page du wiki : recherche par mots (index trigramme), filtre de rareté, curseur sur le rang. */
export async function searchCatalog({ terms, rarity, after }: Pick<WikiParams, "terms" | "rarity" | "after">) {
  const rows = await prisma.card.findMany({
    where: {
      rank: after ? { gt: after } : { not: null },
      ...(rarity && { rarity }),
      AND: terms.map((term) => ({ searchText: { contains: term } })),
    },
    orderBy: { rank: "asc" },
    take: WIKI_PAGE_SIZE + 1,
    select: summarySelect,
  });
  const hasMore = rows.length > WIKI_PAGE_SIZE;
  const cards = hasMore ? rows.slice(0, WIKI_PAGE_SIZE) : rows;
  return { cards, nextAfter: hasMore ? cards.at(-1)!.rank : null };
}
