import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { seriesTitle } from "@/lib/catalog/display";
import { type Rarity } from "@/lib/catalog/rarity";
import { SPECIAL_COPY } from "@/lib/collection/copies";
import { COLLECTION_PAGE_SIZE, type CollectionParams } from "@/lib/collection/params";
import { recycleValue, type RecycleValues } from "@/lib/collection/recycle";
import type { CollectionItem, CollectionPage, CollectionSummary, RarityTotals } from "@/lib/collection/view";
import { getCatalogStats } from "../catalog/queries";
import { getRarities } from "../catalog/rarities";
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
  appearance: unknown;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  spoiler: boolean;
  spoilerKey: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  copies: number;
  free: number;
  ordinary: number;
  inShowcase: boolean;
  maxHeritage: number;
  engraved: boolean;
  viewerOwns: boolean | null;
};

function orderBy(params: CollectionParams): Prisma.Sql {
  const asc = params.dir === "asc";
  const byRank = Prisma.sql`c.rank ASC NULLS LAST`;
  switch (params.sort) {
    case "rarity":
      // À rang égal, une variante (Black Edition) passe au-dessus de sa rareté de base, et deux raretés de même
      // rang (AR et VR) restent chacune en bloc au lieu de s'entremêler par numéro, comme dans compareRarities
      return asc
        ? Prisma.sql`rd."sortOrder" ASC, rd."variantRequired" ASC, c."rarityKey" ASC, ${byRank}`
        : Prisma.sql`rd."sortOrder" DESC, rd."variantRequired" DESC, c."rarityKey" DESC, ${byRank}`;
    case "recent":
      return asc ? Prisma.sql`MAX(uc."obtainedAt") ASC` : Prisma.sql`MAX(uc."obtainedAt") DESC`;
    case "number":
      return asc ? Prisma.sql`c.rank ASC NULLS LAST` : Prisma.sql`c.rank DESC NULLS LAST`;
    case "name":
      return asc ? Prisma.sql`lower(c.name) ASC` : Prisma.sql`lower(c.name) DESC`;
    case "copies":
      return asc
        ? Prisma.sql`COUNT(*) ASC, rd."sortOrder" DESC, rd."variantRequired" DESC, c."rarityKey" DESC`
        : Prisma.sql`COUNT(*) DESC, rd."sortOrder" DESC, rd."variantRequired" DESC, c."rarityKey" DESC`;
    case "power":
      return asc ? Prisma.sql`c.power ASC, ${byRank}` : Prisma.sql`c.power DESC, ${byRank}`;
    case "ki":
      return asc ? Prisma.sql`c.ki ASC, ${byRank}` : Prisma.sql`c.ki DESC, ${byRank}`;
  }
}

function filters(ownerId: string, params: CollectionParams): Prisma.Sql {
  const conditions = [Prisma.sql`uc."ownerId" = ${ownerId}`];
  if (params.rarities.length > 0) conditions.push(Prisma.sql`c."rarityKey" = ANY(${params.rarities})`);
  if (params.series) conditions.push(Prisma.sql`c."seriesId" = ${params.series}`);
  // Termes déjà normalisés (lettres et chiffres seulement) : ni % ni _ ne peuvent s'y glisser
  for (const term of params.terms) conditions.push(Prisma.sql`c."searchText" LIKE ${`%${term}%`}`);
  return Prisma.join(conditions, " AND ");
}

/** Filtres sur les exemplaires d'une carte : doublons, au moins une gravée ou une héritière (prestige). */
function having(params: CollectionParams): Prisma.Sql {
  const conditions = [Prisma.sql`TRUE`];
  if (params.dupes) conditions.push(Prisma.sql`COUNT(*) FILTER (WHERE uc.status = 'COLLECTION') >= 2`);
  if (params.special === "engraved") conditions.push(Prisma.sql`BOOL_OR(uc.printing IS NOT NULL)`);
  if (params.special === "heirs") conditions.push(Prisma.sql`BOOL_OR(uc.heritage > 0)`);
  return Prisma.join(conditions, " AND ");
}

function toItem(row: Row, locale: string): CollectionItem {
  return {
    cardId: row.cardId,
    anilistId: row.anilistId,
    name: row.name,
    nameNative: row.nameNative,
    imageUrl: row.imageUrl,
    appearance: row.appearance,
    rank: row.rank,
    rarity: row.rarity,
    power: row.power,
    ki: row.ki,
    spoiler: row.spoiler,
    spoilerKey: row.spoilerKey,
    series: seriesTitle(row, locale),
    copies: row.copies,
    free: row.free,
    ordinary: row.ordinary,
    // Comme le recyclage (planRecycle) et la fiche : seuls les ordinaires partent, une pièce spéciale jamais
    recyclable: Math.max(0, row.ordinary - 1),
    inShowcase: row.inShowcase,
    heritage: row.maxHeritage,
    engraved: row.engraved,
    ...(row.viewerOwns !== null && { viewerOwns: row.viewerOwns }),
  };
}

/**
 * Une page de la collection : cartes distinctes avec leur nombre d'exemplaires. `viewerId` (collection
 * d'un autre joueur) : chaque carte dit en plus si le visiteur la possède déjà.
 */
export async function getCollectionPage(
  ownerId: string,
  params: CollectionParams,
  offset: number,
  locale: string,
  viewerId?: string,
): Promise<CollectionPage> {
  const start = Math.min(Math.max(0, Math.trunc(offset)), MAX_OFFSET);
  const viewerOwns = viewerId && viewerId !== ownerId
    ? Prisma.sql`EXISTS (SELECT 1 FROM "UserCard" v WHERE v."ownerId" = ${viewerId} AND v."cardId" = c.id)`
    : Prisma.sql`NULL::boolean`;
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.id AS "cardId", c."publicId" AS "anilistId", c.appearance, c.name, c."nameNative", c."imageUrl", c.rank, c."rarityKey" AS rarity,
           c.power, c.ki, c.spoiler, s."titleRomaji", s."titleEnglish",
           -- Clé d'univers d'une carte spoil (mode spoiler) : univers de la série, sinon la série seule
           CASE WHEN c.spoiler THEN COALESCE(s."universeId", s.id) END AS "spoilerKey",
           COUNT(*)::int AS copies,
           (COUNT(*) FILTER (WHERE uc.status = 'COLLECTION'))::int AS free,
           (COUNT(*) FILTER (WHERE uc.status = 'COLLECTION' AND uc.heritage = 0 AND uc.printing IS NULL))::int AS ordinary,
           BOOL_OR(EXISTS (SELECT 1 FROM "ShowcaseItem" sh WHERE sh."userCardId" = uc.id)) AS "inShowcase",
           MAX(uc.heritage)::int AS "maxHeritage",
           BOOL_OR(uc.printing IS NOT NULL) AS engraved,
           ${viewerOwns} AS "viewerOwns"
    FROM "UserCard" uc
    JOIN "Card" c ON c.id = uc."cardId"
    JOIN "Series" s ON s.id = c."seriesId"
    JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    WHERE ${filters(ownerId, params)}
    GROUP BY c.id, s.id, rd."sortOrder", rd."variantRequired"
    HAVING ${having(params)}
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
        SELECT c."rarityKey" AS rarity, c.status = 'PUBLISHED' AS listed, COUNT(*) AS copies,
               -- Doublons recyclables : exemplaires ordinaires en collection (une pièce spéciale ne part jamais en lot)
               COUNT(*) FILTER (WHERE uc.status = 'COLLECTION' AND uc.heritage = 0 AND uc.printing IS NULL) AS free
        FROM "UserCard" uc
        JOIN "Card" c ON c.id = uc."cardId"
        WHERE uc."ownerId" = ${ownerId}
        GROUP BY c.id
      ) g
      GROUP BY g.rarity`,
    getCatalogStats(),
  ]);

  const RARITIES = await getRarities();
  const byRarity = Object.fromEntries(
    RARITIES.map((r) => [r, { unique: 0, copies: 0, recyclable: 0, zeni: 0, inCatalog: 0 }]),
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
    byRarity[row.rarity] = { unique: row.unique, copies: row.copies, recyclable: row.recyclable, zeni, inCatalog: row.inCatalog };
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
    select: {
      id: true,
      status: true,
      obtainedAt: true,
      heritage: true,
      keptByOwner: true,
      printing: true,
      serial: true,
      edition: { select: { size: true } },
      // Les vitrines de ces exemplaires (six au plus chacun), lues par l'index userCardId : un `_count` agrégeait
      // toutes les cartes en vitrine de tous les joueurs à chaque fiche
      showcaseItems: { select: { showcaseId: true } },
    },
  });
  return copies.map((c) => ({
    id: c.id,
    status: c.status,
    obtainedAt: c.obtainedAt,
    /** Prestige : héritage et édition gravée de l'exemplaire (0 et null pour un ordinaire). */
    heritage: c.heritage,
    /** Prestiges traversés chez le joueur : la consécration en demande au moins un. */
    keptByOwner: c.keptByOwner,
    printing: c.printing,
    serial: c.serial,
    /** Taille figée du tirage d'une gravée. */
    size: c.edition?.size ?? null,
    /** Exposé dans au moins une vitrine du joueur. */
    inShowcase: c.showcaseItems.length > 0,
  }));
}

/** Le joueur a-t-il au moins un exemplaire spécial (héritière ou gravée) ? Index partiel des exemplaires spéciaux. */
export async function hasSpecialCopies(ownerId: string): Promise<boolean> {
  const found = await prisma.userCard.findFirst({ where: { ownerId, ...SPECIAL_COPY }, select: { id: true } });
  return found !== null;
}
