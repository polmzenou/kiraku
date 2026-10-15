import "server-only";
import { ADMIN_REVIEW_PAGE_SIZE, reviewWhere, type AdminReviewFilter } from "@/lib/admin/reviews";
import { prisma } from "../db";

// Lecture des avis pour /admin/avis : tous les avis (masqués compris), du plus récent au plus
// ancien, sans cache (la modération voit l'état réel).

export async function listReviewsForAdmin(filter: AdminReviewFilter, page: number) {
  const where = reviewWhere(filter);
  const [items, total, hiddenCount, pinnedCount, allCount] = await Promise.all([
    prisma.review.findMany({
      where,
      // Épinglés d'abord (dans l'ordre du carrousel), puis du plus récent au plus ancien
      orderBy: [{ pinned: "desc" }, { pinnedAt: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      skip: page * ADMIN_REVIEW_PAGE_SIZE,
      take: ADMIN_REVIEW_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        body: true,
        hidden: true,
        pinned: true,
        reply: true,
        repliedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { username: true, image: true, bannedAt: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.count({ where: { hidden: true } }),
    prisma.review.count({ where: { pinned: true } }),
    prisma.review.count(),
  ]);
  return { items, total, counts: { all: allCount, visible: allCount - hiddenCount, hidden: hiddenCount, pinned: pinnedCount } };
}

/** Dernières actions de modération sur les avis, pour le journal de la page. */
export async function recentReviewModeration(take = 10) {
  return prisma.adminLog.findMany({
    where: { targetType: "Review" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, targetId: true, createdAt: true, admin: { select: { username: true } } },
  });
}
