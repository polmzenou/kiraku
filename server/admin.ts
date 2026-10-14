import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "./db";
import { getCurrentUser } from "./user";

// Accès à /admin : vérifié côté serveur dans le layout ET dans chaque Server Action admin.
// Un bouton masqué ne protège rien.

/** Administrateur connecté, ou null. */
export async function getAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || user.bannedAt) return null;
  return user;
}

/** Pour les pages : un non-admin reçoit un 404 (on ne révèle pas que /admin existe). */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) notFound();
  return admin;
}

/** Derniers changements de réglages des boosters, pour le journal de /admin/boosters. */
export async function recentBoosterSettingLogs(take = 15) {
  return prisma.adminLog.findMany({
    where: { action: "SETTING_UPDATE", targetId: { startsWith: "booster." } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      targetId: true,
      before: true,
      after: true,
      createdAt: true,
      admin: { select: { username: true } },
    },
  });
}
