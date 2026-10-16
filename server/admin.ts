import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "./db";
import { requireActiveUser } from "./user";

// Accès à /admin : vérifié côté serveur dans le layout ET dans chaque Server Action admin.
// Un bouton masqué ne protège rien.

/** Administrateur connecté, ou null. */
export async function getAdmin() {
  const user = await requireActiveUser();
  if (!user || user.role !== "ADMIN") return null;
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
  return recentSettingLogs(["booster."], take);
}

/** Derniers changements de réglages dont la clé commence par l'un des préfixes. */
export async function recentSettingLogs(prefixes: readonly string[], take = 15) {
  return prisma.adminLog.findMany({
    where: { action: "SETTING_UPDATE", OR: prefixes.map((p) => ({ targetId: { startsWith: p } })) },
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
