import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { seriesTitle } from "@/lib/catalog/display";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { COLLECTION_PAGE_SIZE, type CollectionParams } from "@/lib/collection/params";
import { recycleValue, type RecycleValues } from "@/lib/collection/recycle";
import type { CollectionItem, CollectionPage, CollectionSummary, RarityTotals, ShowcaseCard } from "@/lib/collection/view";
import { getCatalogStats } from "../catalog/queries";
import { prisma } from "../db";

// Lectures de la collection d'un joueur. Les exemplaires sont groupés par carte en SQL : on ne
// charge jamais tous les UserCard (un joueur actif en a des milliers). Le tri vient d'une liste
// fermée de fragments : aucune chaîne du client n'entre dans la requête.

/** Au-delà, le décalage est refusé : un joueur a au plus autant de lignes que de cartes au catalogue. */
export const MAX_OFFSET = 50_000;

type Row = {
  cardId: string;
  anilistId: number;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  titleRomaji: string;
  titleEnglish: string | null;
  copies: number;
  free: number;
  inShowcase: boolean;
};

function orderBy(params: CollectionParams): Prisma.Sql {
  const asc = params.dir === "asc";
  const byRank = Prisma.sql`c.rank ASC NULLS LAST`;
  switch (params.sort) {
    case "rarity":
      return asc ? Prisma.sql`c.rarity ASC, ${byRank}` : Prisma.sql`c.rarity DESC, ${byRank}`;
    case "recent":
      return asc ? Prisma.sql`MAX(uc."obtainedAt") ASC` : Prisma.sql`MAX(uc."obtainedAt") DESC`;
    case "number":
      return asc ? Prisma.sql`c.rank ASC NULLS LAST` : Prisma.sql`c.rank DESC NULLS LAST`;
    case "name":
      return asc ? Prisma.sql`lower(c.name) ASC` : Prisma.sql`lower(c.name) DESC`;
    case "copies":
      return asc ? Prisma.sql`COUNT(*) ASC, c.rarity DESC` : Prisma.sql`COUNT(*) DESC, c.rarity DESC`;
    case "power":
      return asc ? Prisma.sql`c.power ASC, ${byRank}` : Prisma.sql`c.power DESC, ${byRank}`;
    case "ki":
      return asc ? Prisma.sql`c.ki ASC, ${byRank}` : Prisma.sql`c.ki DESC, ${byRank}`;
  }
}

function filters(ownerId: string, params: CollectionParams): Prisma.Sql {
  const conditions = [Prisma.sql`uc."ownerId" = ${ownerId}`];
  if (params.rarities.length > 0) conditions.push(Prisma.sql`c.rarity::text = ANY(${params.rarities})`);
  if (params.series) conditions.push(Prisma.sql`c."seriesId" = ${params.series}`);
  // Termes déjà normalisés (lettres et chiffres seulement) : ni % ni _ ne peuvent s'y glisser
  for (const term of params.terms) conditions.push(Prisma.sql`c."searchText" LIKE ${`%${term}%`}`);
  return Prisma.join(conditions, " AND ");
}

function toItem(row: Row, locale: string): CollectionItem {
  return {
    cardId: row.cardId,
    anilistId: row.anilistId,
    name: row.name,
    nameNative: row.nameNative,
    imageUrl: row.imageUrl,
    rank: row.rank,
    rarity: row.rarity,
    power: row.power,
    ki: row.ki,
    series: seriesTitle(row, locale),
    copies: row.copies,
    recyclable: Math.max(0, row.free - 1),
    inShowcase: row.inShowcase,
  };
}

/** Une page de la collection : cartes distinctes avec leur nombre d'exemplaires. */
export async function getCollectionPage(
  ownerId: string,
  params: CollectionParams,
  offset: number,
  locale: string,
): Promise<CollectionPage> {
  const start = Math.min(Math.max(0, Math.trunc(offset)), MAX_OFFSET);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.id AS "cardId", c."anilistId", c.name, c."nameNative", c."imageUrl", c.rank, c.rarity::text AS rarity,
           c.power, c.ki, s."titleRomaji", s."titleEnglish",
           COUNT(*)::int AS copies,
           (COUNT(*) FILTER (WHERE uc.status = 'COLLECTION'))::int AS free,
           BOOL_OR(sh."userCardId" IS NOT NULL) AS "inShowcase"
    FROM "UserCard" uc
    JOIN "Card" c ON c.id = uc."cardId"
    JOIN "Series" s ON s.id = c."seriesId"
    LEFT JOIN "ShowcaseSlot" sh ON sh."userCardId" = uc.id
    WHERE ${filters(ownerId, params)}
    GROUP BY c.id, s.id
    HAVING ${params.dupes ? Prisma.sql`COUNT(*) FILTER (WHERE uc.status = 'COLLECTION') >= 2` : Prisma.sql`TRUE`}
    ORDER BY ${orderBy(params)}, c.id ASC
    LIMIT ${COLLECTION_PAGE_SIZE + 1} OFFSET ${start}`;
  const hasMore = rows.length > COLLECTION_PAGE_SIZE;
  const items = (hasMore ? rows.slice(0, COLLECTION_PAGE_SIZE) : rows).map((r) => toItem(r, locale));
  return { items, nextOffset: hasMore ? start + COLLECTION_PAGE_SIZE : null };
}

type SummaryRow = { rarity: Rarity; unique: number; copies: number; recyclable: number; inCatalog: number };

/** Totaux de la collection : cartes uniques, exemplaires, doublons recyclables et leur valeur. */
export async function getCollectionSummary(ownerId: string, values: RecycleValues): Promise<CollectionSummary> {
  const [rows, stats] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT g.rarity,
             COUNT(*)::int AS "unique",
             SUM(g.copies)::int AS copies,
             SUM(GREATEST(g.free - 1, 0))::int AS recyclable,
             (COUNT(*) FILTER (WHERE g.listed))::int AS "inCatalog"
      FROM (
        SELECT c.rarity::text AS rarity, c.rank IS NOT NULL AS listed, COUNT(*) AS copies,
               COUNT(*) FILTER (WHERE uc.status = 'COLLECTION') AS free
        FROM "UserCard" uc
        JOIN "Card" c ON c.id = uc."cardId"
        WHERE uc."ownerId" = ${ownerId}
        GROUP BY c.id
      ) g
      GROUP BY g.rarity`,
    getCatalogStats(),
  ]);

  const byRarity = Object.fromEntries(
    RARITIES.map((r) => [r, { unique: 0, copies: 0, recyclable: 0, zeni: 0 }]),
  ) as Record<Rarity, RarityTotals>;
  const summary: CollectionSummary = {
    unique: 0,
    copies: 0,
    inCatalog: 0,
    catalogTotal: stats.total,
    recyclable: 0,
    recyclableZeni: 0,
    byRarity,
  };
  for (const row of rows) {
    const zeni = recycleValue(row.rarity, row.recyclable, values);
    byRarity[row.rarity] = { unique: row.unique, copies: row.copies, recyclable: row.recyclable, zeni };
    summary.unique += row.unique;
    summary.copies += row.copies;
    summary.inCatalog += row.inCatalog;
    summary.recyclable += row.recyclable;
    summary.recyclableZeni += zeni;
  }
  return summary;
}

/** Séries dont le joueur possède au moins une carte (filtre de la collection), les plus fournies d'abord. */
export async function getOwnedSeries(ownerId: string, locale: string) {
  const rows = await prisma.$queryRaw<{ id: string; titleRomaji: string; titleEnglish: string | null; cards: number }[]>`
    SELECT s.id, s."titleRomaji", s."titleEnglish", COUNT(DISTINCT uc."cardId")::int AS cards
    FROM "UserCard" uc
    JOIN "Card" c ON c.id = uc."cardId"
    JOIN "Series" s ON s.id = c."seriesId"
    WHERE uc."ownerId" = ${ownerId}
    GROUP BY s.id
    ORDER BY cards DESC, s."titleRomaji" ASC
    LIMIT 300`;
  return rows.map((s) => ({ id: s.id, title: seriesTitle(s, locale), cards: s.cards }));
}

/** Exemplaires d'une carte possédés par le joueur (fiche carte), les plus anciens d'abord. */
export async function getOwnedCopies(ownerId: string, cardId: string) {
  const copies = await prisma.userCard.findMany({
    where: { ownerId, cardId },
    orderBy: [{ obtainedAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true, obtainedAt: true, showcase: { select: { position: true } } },
  });
  return copies.map((c) => ({
    id: c.id,
    status: c.status,
    obtainedAt: c.obtainedAt,
    showcasePosition: c.showcase?.position ?? null,
  }));
}

/** Vitrine d'un joueur, case par case (null = vide), limitée aux `size` premières positions. */
export async function getShowcase(ownerId: string, size: number, locale: string): Promise<(ShowcaseCard | null)[]> {
  const slots = await prisma.showcaseSlot.findMany({
    where: { userId: ownerId, position: { gte: 1, lte: size } },
    select: {
      position: true,
      userCard: {
        select: {
          card: {
            select: {
              id: true,
              anilistId: true,
              name: true,
              nameNative: true,
              imageUrl: true,
              rank: true,
              rarity: true,
              power: true,
              ki: true,
              series: { select: { titleRomaji: true, titleEnglish: true } },
            },
          },
        },
      },
    },
  });
  const result: (ShowcaseCard | null)[] = Array.from({ length: size }, () => null);
  for (const slot of slots) {
    const c = slot.userCard.card;
    result[slot.position - 1] = {
      position: slot.position,
      cardId: c.id,
      anilistId: c.anilistId,
      name: c.name,
      nameNative: c.nameNative,
      imageUrl: c.imageUrl,
      rank: c.rank,
      rarity: c.rarity as Rarity,
      power: c.power,
      ki: c.ki,
      series: seriesTitle(c.series, locale),
    };
  }
  return result;
}
