"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { boosterTypeFormSchema } from "@/lib/boosters/admin-form";
import { filterContext } from "@/lib/boosters/pool-filter";
import { slugSchema } from "@/lib/boosters/types";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { getAdmin } from "../admin";
import { BOOSTER_TYPES_TAG } from "../boosters/pools";
import { computePoolCards, loadCandidates, recomputeBoosterPools, toBoosterTypeView } from "../boosters/type-store";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";

// Types de boosters et bannières depuis /admin. Ordre : rôle admin → Zod → rate limit → transaction
// avec une ligne AdminLog (avant / après) → recalcul du pool → cache invalidé (effet immédiat).

export type AdminBoosterError =
  | "FORBIDDEN"
  | "INVALID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SLUG_TAKEN"
  | "UNKNOWN_CARDS"
  | "POOL_TOO_SMALL";

export type AdminBoosterResult = { ok: true; poolSize: number } | { ok: false; error: AdminBoosterError; poolSize?: number };

async function guard() {
  const admin = await getAdmin();
  if (!admin) return { error: "FORBIDDEN" as const };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" as const };
  return { admin };
}

/** Taille du pool qu'aurait ce type aujourd'hui (pour refuser d'activer un pool trop petit). */
async function poolSizeFor(type: Parameters<typeof computePoolCards>[0]) {
  const [candidates, tz] = await Promise.all([loadCandidates(prisma), getSetting("game.timeZone")]);
  return computePoolCards(type, candidates, filterContext(new Date(), tz)).length;
}

const snapshot = (row: Record<string, unknown>) => {
  // Le journal garde tout sauf la liste des cartes du pool (recalculée, volumineuse)
  const copy: Record<string, unknown> = { ...row };
  delete copy.poolCardIds;
  return JSON.parse(JSON.stringify(copy)) as Prisma.InputJsonValue;
};

export async function saveBoosterType(input: unknown): Promise<AdminBoosterResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error! };
  const parsed = boosterTypeFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const v = parsed.data;
  const filter = v.filter;

  // Vedettes : des cartes existantes du catalogue actif seulement
  const featured = [...new Set(v.featuredCardIds)];
  if (featured.length > 0) {
    const found = await prisma.card.count({ where: { id: { in: featured }, rank: { not: null } } });
    if (found !== featured.length) return { ok: false, error: "UNKNOWN_CARDS" };
  }

  const minPool = v.minPoolSize ?? (await getSetting("booster.minPool"));
  const poolSize = await poolSizeFor({ filter, featuredCardIds: featured });
  if (v.active && poolSize < minPool) return { ok: false, error: "POOL_TOO_SMALL", poolSize };

  // Champs écrits un par un, jamais l'objet reçu
  const data = {
    kind: v.kind,
    family: v.family,
    name: { fr: v.name.fr, en: v.name.en },
    tagline: { fr: v.tagline.fr, en: v.tagline.en },
    emblem: v.emblem,
    shape: v.shape,
    theme: { base: v.theme.base, dark: v.theme.dark, pattern: v.theme.pattern, ink: v.theme.ink },
    filter: filter as Prisma.InputJsonValue,
    slotFloors: v.slotFloors,
    usesFreeStock: v.usesFreeStock,
    priceZeni: v.priceZeni,
    countsForPity: v.countsForPity,
    bonusEligible: v.bonusEligible,
    featuredCardIds: featured,
    featuredRate: v.featuredRate,
    featuredPity: v.featuredPity,
    minPoolSize: v.minPoolSize,
    startsAt: v.startsAt ? new Date(v.startsAt) : null,
    endsAt: v.endsAt ? new Date(v.endsAt) : null,
    active: v.active,
  };

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.boosterType.findUnique({ where: { slug: v.slug } });
    if (v.mode === "update" && !before) return "NOT_FOUND" as const;
    if (v.mode === "create" && before) return "SLUG_TAKEN" as const;
    const sortOrder =
      v.mode === "create" ? await tx.boosterType.count({ where: { family: v.family } }) : (before?.sortOrder ?? 0);
    const after =
      v.mode === "create"
        ? await tx.boosterType.create({ data: { slug: v.slug, sortOrder, ...data } })
        : await tx.boosterType.update({ where: { slug: v.slug }, data });
    await tx.adminLog.create({
      data: {
        adminId: g.admin.id,
        action: v.mode === "create" ? (v.kind === "BANNER" ? "BANNER_CREATE" : "BOOSTER_TYPE_CREATE") : "BOOSTER_TYPE_UPDATE",
        targetType: "BoosterType",
        targetId: v.slug,
        before: before ? snapshot(before) : undefined,
        after: snapshot(after),
      },
    });
    return null;
  });
  if (result) return { ok: false, error: result };

  await recomputeBoosterPools(prisma, filterContext(new Date(), await getSetting("game.timeZone")), { slugs: [v.slug] });
  updateTag(BOOSTER_TYPES_TAG);
  return { ok: true, poolSize };
}

const toggleSchema = z.object({ slug: slugSchema, active: z.boolean() }).strict();

/** Active ou désactive un type (refusé si son pool est sous le minimum). */
export async function toggleBoosterType(input: unknown): Promise<AdminBoosterResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error! };
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const { slug, active } = parsed.data;

  const row = await prisma.boosterType.findUnique({ where: { slug } });
  if (!row) return { ok: false, error: "NOT_FOUND" };
  const type = toBoosterTypeView(row);
  const poolSize = await poolSizeFor(type);
  const minPool = type.minPoolSize ?? (await getSetting("booster.minPool"));
  if (active && poolSize < minPool) return { ok: false, error: "POOL_TOO_SMALL", poolSize };

  await prisma.$transaction([
    prisma.boosterType.update({ where: { slug }, data: { active } }),
    prisma.adminLog.create({
      data: {
        adminId: g.admin.id,
        action: "BOOSTER_TYPE_UPDATE",
        targetType: "BoosterType",
        targetId: slug,
        before: { active: row.active },
        after: { active },
      },
    }),
  ]);
  updateTag(BOOSTER_TYPES_TAG);
  return { ok: true, poolSize };
}

/** Recalcule le pool de tous les types (après un import lancé à la main, par exemple). */
export async function recomputePoolsAction(): Promise<{ ok: true; count: number } | { ok: false; error: AdminBoosterError }> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error! };
  const reports = await recomputeBoosterPools(prisma, filterContext(new Date(), await getSetting("game.timeZone")));
  await prisma.adminLog.create({
    data: { adminId: g.admin.id, action: "BOOSTER_POOLS_RECOMPUTE", targetType: "BoosterType", after: { count: reports.length } },
  });
  updateTag(BOOSTER_TYPES_TAG);
  return { ok: true, count: reports.length };
}

export type FeaturedCandidate = { id: string; name: string; rarity: string; series: string; rank: number | null; imageUrl: string };

const searchSchema = z.string().trim().min(2).max(SEARCH_MAX_LENGTH);

/** Recherche de cartes pour choisir les vedettes d'une bannière (10 résultats au plus). */
export async function searchFeaturedCards(input: unknown): Promise<FeaturedCandidate[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return [];
  const terms = normalizeSearch(parsed.data);
  if (!terms) return [];
  const rows = await prisma.card.findMany({
    where: { rank: { not: null }, searchText: { contains: terms } },
    orderBy: { rank: "asc" },
    take: 10,
    select: { id: true, name: true, rarity: true, rank: true, imageUrl: true, series: { select: { titleRomaji: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, rank: c.rank, imageUrl: c.imageUrl, series: c.series.titleRomaji }));
}
