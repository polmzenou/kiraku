import "server-only";
import { autofillSlots } from "@/lib/showcase/autofill";
import { prisma } from "../db";

export type AutofillFilters = {
  /** Série seule, ou toutes. */
  series: string | null;
  /** Rareté minimale (clé du registre), ou toutes. */
  minRarity: string | null;
};

/**
 * « Remplir avec mes meilleures cartes » : les cartes distinctes du joueur qu'il a encore en collection,
 * les plus rares puis les plus populaires d'abord, sur `capacity` cases.
 */
export async function autofillCards(userId: string, capacity: number, filters: AutofillFilters): Promise<(string | null)[]> {
  const rows = await prisma.$queryRaw<{ cardId: string; raritySort: number; rank: number | null }[]>`
    SELECT c.id AS "cardId", rd."sortOrder"::int AS "raritySort", c.rank
    FROM "UserCard" uc
    JOIN "Card" c ON c.id = uc."cardId"
    JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    WHERE uc."ownerId" = ${userId}
      AND uc.status = 'COLLECTION'
      AND (${filters.series}::text IS NULL OR c."seriesId" = ${filters.series})
      AND (${filters.minRarity}::text IS NULL OR rd."sortOrder" >= (SELECT "sortOrder" FROM "RarityDefinition" WHERE key = ${filters.minRarity}))
    GROUP BY c.id, rd."sortOrder", c.rank
    ORDER BY rd."sortOrder" DESC, c.rank ASC NULLS LAST, c.id ASC
    LIMIT ${capacity}`;
  return autofillSlots(rows, capacity);
}
