// Types de boosters en base : lecture validée, pools filtrés et seed. Volontairement sans
// "server-only" ni server/db.ts : le client Prisma est injecté (serveur, scripts, tests).
import type { BoosterType as BoosterTypeRow, PrismaClient, Prisma } from "@/generated/prisma/client";
import { groupByRarity, poolCounts, type CardPool } from "@/lib/boosters/draw";
import { filterPool, isDynamicFilter, parsePoolFilter, type FilterContext, type PoolCandidate } from "@/lib/boosters/pool-filter";
import { isPoolStale } from "@/lib/boosters/pool-freshness";
import {
  BOOSTER_FAMILIES,
  isRarity,
  parseLocalized,
  parseTheme,
  type BoosterFamily,
  type BoosterTypeView,
} from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import type { BoosterSeed } from "@/prisma/seed/booster-types";

type Db = Pick<PrismaClient, "boosterType" | "card"> | Pick<Prisma.TransactionClient, "boosterType" | "card">;

/** Ligne BoosterType → vue validée (thème, noms et filtre contrôlés par Zod). */
export function toBoosterTypeView(row: Omit<BoosterTypeRow, "poolCardIds">): BoosterTypeView {
  const family = (BOOSTER_FAMILIES as readonly string[]).includes(row.family) ? (row.family as BoosterFamily) : "special";
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    family,
    sortOrder: row.sortOrder,
    name: parseLocalized(row.name, row.slug),
    tagline: parseLocalized(row.tagline),
    emblem: row.emblem,
    shape: row.shape,
    theme: parseTheme(row.theme),
    filter: parsePoolFilter(row.filter),
    slotFloors: row.slotFloors.filter(isRarity),
    usesFreeStock: row.usesFreeStock,
    priceZeni: row.priceZeni,
    countsForPity: row.countsForPity,
    bonusEligible: row.bonusEligible,
    featuredCardIds: row.featuredCardIds,
    featuredRate: row.featuredRate,
    featuredPity: row.featuredPity,
    minPoolSize: row.minPoolSize,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
  };
}

/** Toutes les cartes classées avec les champs de filtre de leur œuvre principale (rang croissant). */
export async function loadCandidates(db: Pick<PrismaClient, "card">): Promise<PoolCandidate[]> {
  const rows = await db.card.findMany({
    where: { status: "PUBLISHED", dropWeight: { gt: 0 } },
    orderBy: { rank: "asc" },
    select: {
      id: true,
      anilistId: true,
      origin: true,
      boosterIds: true,
      rarity: true,
      gender: true,
      role: true,
      birthMonth: true,
      birthDay: true,
      series: {
        select: { anilistId: true, type: true, genres: true, tags: true, year: true, season: true, seasonYear: true, studio: true },
      },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    origin: c.origin,
    boosterIds: c.boosterIds,
    anilistId: c.anilistId,
    rarity: c.rarity as Rarity,
    gender: c.gender,
    role: c.role,
    birthMonth: c.birthMonth,
    birthDay: c.birthDay,
    seriesAnilistId: c.series.anilistId,
    mediaType: c.series.type,
    genres: c.series.genres,
    tags: c.series.tags,
    year: c.series.year,
    season: c.series.season,
    seasonYear: c.series.seasonYear,
    studio: c.series.studio,
  }));
}

/**
 * Cartes du pool d'un type : celles qui passent le filtre, plus les vedettes d'une bannière
 * (toujours tirables, même hors filtre). Un filtre invalide donne un pool vide.
 */
export function computePoolCards(
  type: Pick<BoosterTypeView, "filter" | "featuredCardIds"> & { id?: string },
  candidates: readonly PoolCandidate[],
  ctx: FilterContext,
): { id: string; rarity: Rarity }[] {
  if (!type.filter) return [];
  const kept = [
    ...filterPool(candidates.filter((c) => c.origin !== "CUSTOM"), type.filter, ctx),
    ...candidates.filter((c) => c.origin === "CUSTOM" && type.id && c.boosterIds?.includes(type.id)),
  ];
  if (type.featuredCardIds.length === 0) return kept;
  const ids = new Set(kept.map((c) => c.id));
  const featured = new Set(type.featuredCardIds);
  return [...kept, ...candidates.filter((c) => featured.has(c.id) && !ids.has(c.id) && (c.origin !== "CUSTOM" || (type.id && c.boosterIds?.includes(type.id))))];
}

export function computePool(
  type: Pick<BoosterTypeView, "filter" | "featuredCardIds"> & { id?: string },
  candidates: readonly PoolCandidate[],
  ctx: FilterContext,
): CardPool {
  return groupByRarity(computePoolCards(type, candidates, ctx));
}

export type PoolReport = { slug: string; size: number; counts: Record<Rarity, number> };

/**
 * Recalcule et enregistre le pool de chaque type (ou des slugs donnés). Avec `onlyStale`, seuls les
 * pools périmés sont refaits, et le catalogue n'est pas lu s'il n'y en a aucun.
 */
export async function recomputeBoosterPools(
  db: Db,
  ctx: FilterContext,
  opts: { slugs?: string[]; now?: Date; onlyStale?: { catalogVersion: number; timeZone: string } } = {},
): Promise<PoolReport[]> {
  const now = opts.now ?? new Date();
  // Requêtes l'une après l'autre : `db` peut être une transaction, qui n'a qu'une connexion.
  const all = await db.boosterType.findMany({ where: opts.slugs ? { slug: { in: opts.slugs } } : undefined, omit: { poolCardIds: true } });
  const stale = opts.onlyStale;
  const rows = stale
    ? all.filter((row) => {
        const view = toBoosterTypeView(row);
        const dynamic = view.filter !== null && isDynamicFilter(view.filter);
        return isPoolStale({ poolComputedAt: row.poolComputedAt, updatedAt: row.updatedAt, dynamic }, stale.catalogVersion, now, stale.timeZone);
      })
    : all;
  if (rows.length === 0) return [];
  const candidates = await loadCandidates(db);
  const reports: PoolReport[] = [];
  for (const row of rows) {
    const cards = computePoolCards(toBoosterTypeView(row), candidates, ctx);
    const counts = poolCounts(groupByRarity(cards));
    await db.boosterType.update({
      where: { id: row.id },
      // updatedAt explicite : sinon Prisma le pose un instant après poolComputedAt, et le pool
      // paraîtrait toujours plus ancien que son type.
      data: { poolCardIds: cards.map((c) => c.id), poolCounts: counts, poolComputedAt: now, updatedAt: now },
    });
    reports.push({ slug: row.slug, size: cards.length, counts });
  }
  return reports;
}

/**
 * Charge les boosters de départ : crée ceux qui manquent ; un type déjà en base n'est réécrit
 * qu'avec `force` (sinon les réglages faits dans l'admin seraient perdus).
 */
export async function upsertBoosterSeeds(
  db: Pick<PrismaClient, "boosterType">,
  seeds: readonly BoosterSeed[],
  opts: { force?: boolean; slugs?: readonly string[] } = {},
): Promise<{ created: string[]; updated: string[]; kept: string[] }> {
  const existing = new Set((await db.boosterType.findMany({ select: { slug: true } })).map((r) => r.slug));
  const order = new Map<string, number>();
  const result = { created: [] as string[], updated: [] as string[], kept: [] as string[] };

  for (const seed of seeds) {
    const sortOrder = order.get(seed.family) ?? 0;
    order.set(seed.family, sortOrder + 1);
    if (opts.slugs && !opts.slugs.includes(seed.slug)) continue;
    const data = {
      kind: seed.kind,
      family: seed.family,
      sortOrder,
      name: seed.name,
      tagline: seed.tagline,
      emblem: seed.emblem,
      shape: seed.shape ?? "SACHET",
      theme: seed.theme,
      filter: seed.filter ?? {},
      slotFloors: seed.slotFloors ?? [],
      usesFreeStock: seed.usesFreeStock ?? true,
      priceZeni: seed.priceZeni ?? null,
      countsForPity: seed.countsForPity ?? true,
      bonusEligible: seed.bonusEligible ?? true,
      minPoolSize: seed.minPoolSize ?? null,
      active: seed.active ?? true,
    };
    if (!existing.has(seed.slug)) {
      await db.boosterType.create({ data: { slug: seed.slug, ...data } });
      result.created.push(seed.slug);
    } else if (opts.force) {
      await db.boosterType.update({ where: { slug: seed.slug }, data });
      result.updated.push(seed.slug);
    } else {
      result.kept.push(seed.slug);
    }
  }
  return result;
}
