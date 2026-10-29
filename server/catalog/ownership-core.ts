import type { PrismaClient } from "@/generated/prisma/client";
import type { WikiCollection } from "@/lib/catalog/wiki-state";

type Row = { anilistId: number; copies: number; discovered: boolean };

/** One grouped read, including history and copies in auction/battle. No per-card lookups. */
export async function readWikiCollection(db: Pick<PrismaClient, "$queryRaw">, userId: string): Promise<WikiCollection> {
  const rows = await db.$queryRaw<Row[]>`
    WITH owned AS (
      SELECT "cardId", COUNT(*)::int AS copies
      FROM "UserCard" WHERE "ownerId" = ${userId}
      GROUP BY "cardId"
    ), discovered AS (
      SELECT "cardId" FROM "Discovery" WHERE "userId" = ${userId}
    )
    SELECT c."publicId" AS "anilistId", COALESCE(o.copies, 0)::int AS copies,
           (d."cardId" IS NOT NULL OR COALESCE(o.copies, 0) > 0) AS discovered
    FROM owned o
    FULL OUTER JOIN discovered d ON d."cardId" = o."cardId"
    JOIN "Card" c ON c.id = COALESCE(o."cardId", d."cardId")`;
  return toCollection(rows);
}

/** Même lecture, limitée à quelques cartes (fiche du wiki : la carte et ses voisines). */
export async function readWikiCards(db: Pick<PrismaClient, "$queryRaw">, userId: string, anilistIds: readonly number[]): Promise<WikiCollection> {
  if (anilistIds.length === 0) return toCollection([]);
  const rows = await db.$queryRaw<Row[]>`
    WITH wanted AS (
      SELECT id FROM "Card" WHERE "publicId" = ANY(${[...anilistIds]})
    ), owned AS (
      SELECT "cardId", COUNT(*)::int AS copies
      FROM "UserCard" WHERE "ownerId" = ${userId} AND "cardId" IN (SELECT id FROM wanted)
      GROUP BY "cardId"
    ), discovered AS (
      SELECT "cardId" FROM "Discovery" WHERE "userId" = ${userId} AND "cardId" IN (SELECT id FROM wanted)
    )
    SELECT c."publicId" AS "anilistId", COALESCE(o.copies, 0)::int AS copies,
           (d."cardId" IS NOT NULL OR COALESCE(o.copies, 0) > 0) AS discovered
    FROM owned o
    FULL OUTER JOIN discovered d ON d."cardId" = o."cardId"
    JOIN "Card" c ON c.id = COALESCE(o."cardId", d."cardId")`;
  return toCollection(rows);
}

function toCollection(rows: Row[]): WikiCollection {
  return {
    available: true,
    hasCards: rows.some((r) => r.copies > 0),
    cards: new Map(rows.map(({ anilistId, copies, discovered }) => [anilistId, { copies, discovered }])),
  };
}
