import "server-only";
import { unstable_cache } from "next/cache";
import type { CardPool } from "@/lib/boosters/draw";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { CATALOG_TAG, getCatalogVersion } from "../catalog/queries";
import { prisma } from "../db";

// Pool du booster standard : ids des cartes du catalogue actif, groupés par rareté. Gardé en cache
// avec la version du catalogue dans la clé : un tirage n'est qu'une lecture en mémoire.

const loadStandardPool = unstable_cache(
  async (_version: number): Promise<CardPool> => {
    const rows = await prisma.card.findMany({
      where: { rank: { not: null } },
      select: { id: true, rarity: true },
      orderBy: { rank: "asc" },
    });
    const pool = Object.fromEntries(RARITIES.map((r) => [r, [] as string[]])) as Record<Rarity, string[]>;
    for (const row of rows) pool[row.rarity as Rarity].push(row.id);
    return pool;
  },
  ["booster-pool-standard"],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export async function getStandardPool(): Promise<CardPool> {
  return loadStandardPool(await getCatalogVersion());
}

export function poolSize(pool: CardPool): number {
  return RARITIES.reduce((sum, r) => sum + pool[r].length, 0);
}
