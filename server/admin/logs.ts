import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ADMIN_LOG_PAGE_SIZE, dateRange, type AdminLogParams } from "@/lib/admin/logs";
import { prisma } from "../db";

/**
 * Journal AdminLog filtré, du plus récent au plus ancien, par curseur (id de la dernière ligne vue). `timeZone` : celui
 * des heures affichées, pour les bornes de dates. `hideAdminTargets` (DEV, lecture seule) : sans les modifications
 * faites sur le compte d'un administrateur, que sa fiche ne lui montre pas non plus.
 */
export async function listAdminLogs(params: AdminLogParams, { timeZone, hideAdminTargets }: { timeZone: string; hideAdminTargets: boolean }) {
  const range = dateRange(params, timeZone);
  const admins = hideAdminTargets ? (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id) : [];
  const where: Prisma.AdminLogWhereInput = {
    ...(params.action ? { action: { startsWith: params.action } } : {}),
    ...(params.type ? { targetType: params.type } : {}),
    ...(params.target ? { targetId: { startsWith: params.target } } : {}),
    ...(params.admin ? { admin: { username: { equals: params.admin, mode: "insensitive" } } } : {}),
    ...(range.gte || range.lt ? { createdAt: range } : {}),
    // Écrit en OR plutôt qu'en NOT : une cible nulle reste visible (NOT (… IN …) vaut NULL en SQL)
    ...(admins.length > 0 ? { OR: [{ targetType: { not: "User" } }, { targetId: null }, { targetId: { notIn: admins } }] } : {}),
  };
  const rows = await prisma.adminLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_LOG_PAGE_SIZE + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      before: true,
      after: true,
      createdAt: true,
      admin: { select: { id: true, username: true } },
    },
  });
  const hasMore = rows.length > ADMIN_LOG_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, ADMIN_LOG_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Lien de la cible, quand elle a une page dans l'admin. */
export function adminTargetHref(targetType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  switch (targetType) {
    case "User":
      return `/admin/utilisateurs/${targetId}`;
    case "BoosterType":
      return `/admin/boosters/types/${targetId}`;
    case "LegalPage":
      return `/admin/legal/${targetId.split(":")[0]}`;
    default:
      return null;
  }
}
