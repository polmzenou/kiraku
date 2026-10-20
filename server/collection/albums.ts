import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ALBUM_PAGE_SIZE, likePattern, type Album, type AlbumPage, type AlbumParams } from "@/lib/collection/albums";
import { seriesTitle } from "@/lib/catalog/display";
import { prisma } from "../db";

type AlbumRow = {
  id: string;
  titleRomaji: string;
  titleEnglish: string | null;
  cover: string | null;
  owned: number;
  total: number;
  fullCount: number;
  byRarity: Album["byRarity"];
};

/**
 * Albums de la collection : une ligne par série du catalogue (cartes classées), avec le total et
 * les cartes distinctes possédées par rareté. Couverture : la meilleure carte possédée, sinon la
 * plus populaire de la série.
 */
export async function getAlbumPage(ownerId: string, params: AlbumParams, offset: number, locale: string): Promise<AlbumPage> {
  const search = params.q
    ? Prisma.sql`AND (s."titleRomaji" ILIKE ${likePattern(params.q)} OR s."titleEnglish" ILIKE ${likePattern(params.q)})`
    : Prisma.empty;
  const started = params.all ? Prisma.empty : Prisma.sql`HAVING COUNT(o."cardId") > 0`;
  const title = locale === "en" ? Prisma.sql`COALESCE(s."titleEnglish", s."titleRomaji")` : Prisma.sql`s."titleRomaji"`;
  const order =
    params.sort === "az"
      ? Prisma.sql`ORDER BY ${title} ASC`
      : params.sort === "progress"
        ? Prisma.sql`ORDER BY COUNT(o."cardId")::float / COUNT(*) DESC, COUNT(o."cardId") DESC, ${title} ASC`
        : Prisma.sql`ORDER BY COUNT(o."cardId") DESC, COUNT(*) DESC, ${title} ASC`;

  const rows = await prisma.$queryRaw<AlbumRow[]>`
    WITH owned AS (SELECT DISTINCT "cardId" FROM "UserCard" WHERE "ownerId" = ${ownerId})
    SELECT s.id, s."titleRomaji", s."titleEnglish",
      COALESCE(
        (array_agg(c."imageUrl" ORDER BY rd."sortOrder" DESC, c.rank ASC) FILTER (WHERE o."cardId" IS NOT NULL))[1],
        (array_agg(c."imageUrl" ORDER BY c.rank ASC))[1]
      ) AS cover,
      COUNT(o."cardId")::int AS owned,
      COUNT(*)::int AS total,
      (COUNT(*) OVER ())::int AS "fullCount",
      (SELECT jsonb_object_agg(x.rarity, jsonb_build_object('owned', x.owned, 'total', x.total)) FROM (
        SELECT c2."rarityKey" AS rarity, COUNT(*)::int AS total, COUNT(o2."cardId")::int AS owned
        FROM "Card" c2 LEFT JOIN owned o2 ON o2."cardId" = c2.id
        JOIN "RarityDefinition" rd2 ON rd2.key = c2."rarityKey"
        WHERE c2."seriesId" = s.id AND c2.status = 'PUBLISHED'
        GROUP BY c2."rarityKey", rd2."sortOrder" ORDER BY rd2."sortOrder", c2."rarityKey"
      ) x) AS "byRarity"
    FROM "Card" c
    JOIN "Series" s ON s.id = c."seriesId"
    JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    LEFT JOIN owned o ON o."cardId" = c.id
    WHERE c.status = 'PUBLISHED' ${search}
    GROUP BY s.id
    ${started}
    ${order}
    LIMIT ${ALBUM_PAGE_SIZE} OFFSET ${offset}`;

  const items: Album[] = rows.map((r) => ({
    seriesId: r.id,
    title: seriesTitle(r, locale),
    cover: r.cover,
    owned: r.owned,
    total: r.total,
    byRarity: r.byRarity,
  }));
  const total = rows[0]?.fullCount ?? 0;
  const next = offset + items.length;
  return { items, total, nextOffset: items.length === ALBUM_PAGE_SIZE && next < total ? next : null };
}
