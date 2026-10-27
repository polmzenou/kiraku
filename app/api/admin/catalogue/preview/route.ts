import { unstable_cache } from "next/cache";
import { z } from "@/lib/zod";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { cardFormSchema } from "@/lib/catalog/admin-form";
import { cardOdds } from "@/lib/catalog/card-odds";
import { computePool, focusCards, loadCandidates } from "@/server/boosters/type-store";
import { getBoosterTypes, getFilterContext } from "@/server/boosters/pools";
import { getBoosterRules } from "@/server/boosters/rules";
import { CATALOG_TAG, getCatalogVersion } from "@/server/catalog/queries";
import { getStaff } from "@/server/admin";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/ratelimit";
import { effectiveSlotFloors } from "@/lib/boosters/types";
import { featuredFromPool } from "@/lib/boosters/draw";

const schema = z.object({ id: z.string().max(64).optional(), rarity: rarityKeySchema, dropWeight: z.number().int().min(0).max(1_000_000),
  boosterIds: z.array(z.string().max(64)).max(200), scenario: z.enum(["normal", "golden", "divine", "pity"]), featuredPity: z.boolean(),
  seriesId: z.string().max(64).nullable(), gender: z.string().max(40).nullable(), role: z.string().max(40).nullable(), birthMonth: z.number().nullable(), birthDay: z.number().nullable(),
  newSeries: cardFormSchema.shape.newSeries.optional(),
});
const candidates = unstable_cache(async (_version: number) => { void _version; return loadCandidates(prisma); }, ["admin-preview-candidates"], { tags: [CATALOG_TAG], revalidate: 3600 });
export async function POST(request: Request) {
  const admin = (await getStaff())?.user; if (!admin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!(await rateLimit(`admin-card-preview:${admin.id}`, { limit: 120, windowSeconds: 60 })).success) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const body = await request.text(); if (body.length > 32_000) return Response.json({ error: "INVALID" }, { status: 400 });
  const parsed = schema.safeParse(await Promise.resolve().then(() => JSON.parse(body)).catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID" }, { status: 400 });
  const v = parsed.data;
  const [entries, rules, ctx, all, existing, series] = await Promise.all([
    getBoosterTypes(), getBoosterRules(), getFilterContext(), candidates(await getCatalogVersion()),
    v.id ? prisma.card.findUnique({ where: { id: v.id } }) : null,
    v.newSeries ? { ...v.newSeries, anilistId: null } : v.seriesId ? prisma.series.findUnique({ where: { id: v.seriesId } }) : null,
  ]);
  if (!rules.draw.rarities?.includes(v.rarity)) return Response.json({ error: "UNKNOWN_RARITY" }, { status: 400 });
  const targetId = existing?.id ?? "preview-card";
  const candidate = { id: targetId, anilistId: existing?.anilistId ?? null, origin: existing?.origin ?? "CUSTOM", boosterIds: v.boosterIds,
    rarity: v.rarity, gender: v.gender, role: v.role, birthMonth: v.birthMonth, birthDay: v.birthDay,
    seriesAnilistId: series?.anilistId ?? null, mediaType: series?.type ?? "CUSTOM", genres: series?.genres ?? [], tags: series?.tags ?? [],
    year: series?.year ?? null, season: series?.season ?? null, seasonYear: series?.seasonYear ?? null, studio: series?.studio ?? null };
  const updated = [...all.filter((c) => c.id !== targetId), ...(v.dropWeight > 0 ? [candidate] : [])];
  const result = entries.filter((e) => v.boosterIds.includes(e.type.id) || (existing?.origin === "ANILIST" && computePool(e.type, updated, ctx)[v.rarity]?.includes(targetId))).map(({ type }) => {
    const pool = computePool(type, updated, ctx);
    return { id: type.id, name: type.name, slug: type.slug, eligible: Boolean(pool[v.rarity]?.includes(targetId)),
      ...cardOdds({ targetId, pool, rules: { ...rules.draw, cardWeights: { ...rules.draw.cardWeights, [targetId]: v.dropWeight },
        slotFloors: effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors) },
        featured: featuredFromPool([...type.featuredCardIds, ...focusCards(updated, type.focusSeriesIds)], pool, { rate: type.featuredRate, pityThreshold: type.featuredPity }),
        scenario: v.scenario, pityEligible: type.countsForPity, bonusEligible: type.bonusEligible, featuredPity: v.featuredPity && type.featuredPity > 0 }) };
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
