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
  tC: number; oC: number;
  tU: number; oU: number;
  tR: number; oR: number;
  tE: number; oE: number;
  tL: number; oL: number;
  tM: number; oM: number;
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
        (array_agg(c."imageUrl" ORDER BY c.rarity DESC, c.rank ASC) FILTER (WHERE o."cardId" IS NOT NULL))[1],
        (array_agg(c."imageUrl" ORDER BY c.rank ASC))[1]
      ) AS cover,
      COUNT(o."cardId")::int AS owned,
      COUNT(*)::int AS total,
      (COUNT(*) OVER ())::int AS "fullCount",
      COUNT(*) FILTER (WHERE c.rarity = 'COMMON')::int AS "tC",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'COMMON')::int AS "oC",
      COUNT(*) FILTER (WHERE c.rarity = 'UNCOMMON')::int AS "tU",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'UNCOMMON')::int AS "oU",
      COUNT(*) FILTER (WHERE c.rarity = 'RARE')::int AS "tR",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'RARE')::int AS "oR",
      COUNT(*) FILTER (WHERE c.rarity = 'EPIC')::int AS "tE",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'EPIC')::int AS "oE",
      COUNT(*) FILTER (WHERE c.rarity = 'LEGENDARY')::int AS "tL",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'LEGENDARY')::int AS "oL",
      COUNT(*) FILTER (WHERE c.rarity = 'MYTHIC')::int AS "tM",
      COUNT(o."cardId") FILTER (WHERE c.rarity = 'MYTHIC')::int AS "oM"
    FROM "Card" c
    JOIN "Series" s ON s.id = c."seriesId"
    LEFT JOIN owned o ON o."cardId" = c.id
    WHERE c.rank IS NOT NULL ${search}
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
    byRarity: {
      COMMON: { owned: r.oC, total: r.tC },
      UNCOMMON: { owned: r.oU, total: r.tU },
      RARE: { owned: r.oR, total: r.tR },
      EPIC: { owned: r.oE, total: r.tE },
      LEGENDARY: { owned: r.oL, total: r.tL },
      MYTHIC: { owned: r.oM, total: r.tM },
    },
  }));
  const total = rows[0]?.fullCount ?? 0;
  const next = offset + items.length;
  return { items, total, nextOffset: items.length === ALBUM_PAGE_SIZE && next < total ? next : null };
}
