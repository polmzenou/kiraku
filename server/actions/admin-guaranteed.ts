"use server";

import { refresh } from "next/cache";
import type { AdminUserError } from "@/lib/admin/users";
import { guaranteedPoolCount, guaranteeGrantSchema } from "@/lib/boosters/guaranteed";
import { getAdmin } from "../admin";
import { AdminUserMutationError, mutateAdminUserWith } from "../admin/users-core";
import { prisma } from "../db";
import { pushLater } from "../market/queries";
import { rateLimit } from "../ratelimit";

// Don d'un booster garanti depuis /admin/boosters/garantis. Ordre : rôle admin → Zod → rate limit →
// type et joueur relus en base → crédit, cadeau de l'équipe (notification) et AdminLog sous verrou,
// par le même chemin que la fiche joueur (mutateAdminUserWith, qui revérifie le rôle sous verrou).

export type GrantGuaranteedError = AdminUserError | "NO_USER" | "NOT_GUARANTEED" | "EMPTY_RARITY";
export type GrantGuaranteedResult = { ok: true; username: string; quantity: number } | { ok: false; error: GrantGuaranteedError };

export async function grantGuaranteedBoosterAction(input: unknown): Promise<GrantGuaranteedResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = guaranteeGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  // Même compteur que la fiche joueur : les deux chemins écrivent les mêmes crédits
  if (!(await rateLimit(`admin-users:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const { slug, username, quantity, reason, message } = parsed.data;
  const [type, user] = await Promise.all([
    prisma.boosterType.findUnique({ where: { slug }, select: { id: true, kind: true, guaranteed: true, poolCounts: true } }),
    prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: { id: true, username: true } }),
  ]);
  if (!type || type.kind !== "GUARANTEED" || !type.guaranteed) return { ok: false, error: "NOT_GUARANTEED" };
  if (!user) return { ok: false, error: "NO_USER" };
  // Sans carte de sa rareté, le booster ne s'ouvrirait pas : on ne le donne pas
  if (guaranteedPoolCount(type.poolCounts, type.guaranteed) === 0) return { ok: false, error: "EMPTY_RARITY" };

  try {
    await mutateAdminUserWith(
      prisma,
      admin.id,
      { kind: "booster", userId: user.id, boosterTypeId: type.id, mode: "ADD", amount: quantity, reason, message },
      pushLater,
    );
  } catch (e) {
    if (e instanceof AdminUserMutationError) return { ok: false, error: e.code };
    throw e;
  }
  refresh();
  return { ok: true, username: user.username, quantity };
}
