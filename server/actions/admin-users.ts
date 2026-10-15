"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { adminUserMutationSchema, type AdminCardCandidate, type AdminUserResult } from "@/lib/admin/users";
import { normalizeSearch } from "@/lib/catalog/search";
import { getAdmin } from "../admin";
import { mutateAdminUserWith, AdminUserMutationError } from "../admin/users-core";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { REVIEWS_TAG } from "../social/reviews";

export async function mutateAdminUserAction(input: unknown): Promise<AdminUserResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = adminUserMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-users:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await mutateAdminUserWith(prisma, admin.id, parsed.data);
  } catch (e) {
    if (e instanceof AdminUserMutationError) return { ok: false, error: e.code };
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") return { ok: false, error: "USERNAME_TAKEN" };
    throw e;
  }
  updateTag(LEADERBOARD_TAG);
  if (parsed.data.kind === "account") updateTag(REVIEWS_TAG);
  refresh();
  return { ok: true };
}

/** Recherche sans filtre de rareté, de disponibilité ou de présence dans le catalogue actuel. */
export async function searchAdminCards(input: unknown): Promise<AdminCardCandidate[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const parsed = z.string().trim().min(1).max(100).safeParse(input);
  if (!parsed.success || !(await rateLimit(`admin-card-search:${admin.id}`, { limit: 60, windowSeconds: 60 })).success) return [];
  const q = parsed.data;
  const terms = normalizeSearch(q).split(" ").filter(Boolean);
  const select = { id: true, anilistId: true, name: true, rarity: true, imageUrl: true, rank: true, series: { select: { titleRomaji: true } } } as const;
  const exact = await prisma.card.findFirst({ where: { OR: [{ id: q }, ...(/^\d{1,9}$/.test(q) ? [{ anilistId: Number(q) }] : [])] }, select });
  if (exact) return [{ ...exact, series: exact.series.titleRomaji }];
  if (!terms.length) return [];
  const rows = await prisma.card.findMany({
    where: { AND: terms.map((term) => ({ searchText: { contains: term } })) },
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { id: "asc" }], take: 30,
    select,
  });
  return rows.map((c) => ({ ...c, series: c.series.titleRomaji }));
}
