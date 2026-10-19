"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { adminUserMutationSchema, type AdminCardCandidate, type AdminUserResult } from "@/lib/admin/users";
import { normalizeSearch } from "@/lib/catalog/search";
import { getAdmin } from "../admin";
import { mutateAdminUserWith, AdminUserMutationError } from "../admin/users-core";
import { deleteUserWith, UserDeleteError, type UserDeleteErrorCode } from "../admin/users-delete-core";
import { LEADERBOARD_TAG } from "../collection/leaderboard";
import { pushLater } from "../market/queries";
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

const deleteUsersSchema = z
  .object({
    ids: z.array(z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/)).min(1).max(50),
    reason: z.string().trim().min(1).max(300),
    // Mot retapé dans la langue de l'admin
    confirm: z.enum(["SUPPRIMER", "DELETE"]),
  })
  .strict();

export type DeleteUsersResult =
  | { ok: true; deleted: string[]; failed: { id: string; error: UserDeleteErrorCode }[] }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" };

/**
 * Suppression définitive d'un ou plusieurs comptes (50 au plus). Une transaction par compte : un
 * refus (admin, soi-même, ancien admin) n'empêche pas les autres.
 */
export async function adminDeleteUsersAction(input: unknown): Promise<DeleteUsersResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = deleteUsersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-delete-users:${admin.id}`, { limit: 5, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const deleted: string[] = [];
  const failed: { id: string; error: UserDeleteErrorCode }[] = [];
  for (const id of [...new Set(parsed.data.ids)]) {
    try {
      await deleteUserWith(prisma, { adminId: admin.id, userId: id, reason: parsed.data.reason }, pushLater);
      deleted.push(id);
    } catch (e) {
      if (e instanceof UserDeleteError) failed.push({ id, error: e.code });
      else throw e;
    }
  }
  if (deleted.length > 0) {
    updateTag(LEADERBOARD_TAG);
    updateTag(REVIEWS_TAG);
    refresh();
  }
  return { ok: true, deleted, failed };
}
