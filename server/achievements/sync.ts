import "server-only";
import { cache } from "react";
import { activeAchievements, EMPTY_STATS, evaluateAll, freshUnlocks, neededStats, type AchievementProgress, type AchievementSettings } from "@/lib/achievements/evaluate";
import type { AchievementDef } from "@/lib/achievements/catalog";
import { prisma } from "../db";
import { getProfileStats } from "../profile/progress";
import { getSetting } from "../settings";
import { getAchievementStatsWith } from "./stats-core";

// Succès d'un joueur : relus dans son historique, évalués, et les nouveaux déblocages enregistrés pour de bon
// (comme les séries complétées). Appelé à l'ouverture de la page /succes.

export const getAchievementSettings = cache(async (): Promise<AchievementSettings> => {
  const [enabled, goals, disabled] = await Promise.all([getSetting("achievements.enabled"), getSetting("achievements.goals"), getSetting("achievements.disabled")]);
  return { enabled, goals, disabled };
});

export type AchievementBoard = {
  defs: AchievementDef[];
  progress: AchievementProgress[];
  settings: AchievementSettings;
};

/** Avancée de chaque succès actif ; enregistre ceux qui viennent d'être atteints. Null : succès coupés dans l'admin. */
export async function syncAchievements(userId: string, now = new Date()): Promise<AchievementBoard | null> {
  const settings = await getAchievementSettings();
  if (!settings.enabled) return null;
  const defs = activeAchievements(settings.disabled);
  const rows = await prisma.userAchievement.findMany({ where: { userId }, select: { key: true, unlockedAt: true } });
  const stored = new Map(rows.map((r) => [r.key, r.unlockedAt]));
  const needed = neededStats(defs, stored);
  const stats =
    needed.size === 0
      ? EMPTY_STATS
      : await getAchievementStatsWith(prisma, userId, needed, {
          timeZone: await getSetting("game.timeZone"),
          now,
          loadProfile: () => getProfileStats(userId, []),
        });
  const progress = evaluateAll(defs, stats, stored, settings.goals);
  const fresh = freshUnlocks(progress);
  if (fresh.length > 0) {
    await prisma.userAchievement.createMany({ data: fresh.map((key) => ({ userId, key, unlockedAt: now })), skipDuplicates: true });
    // Date réellement enregistrée (une autre requête a pu passer juste avant)
    const saved = await prisma.userAchievement.findMany({ where: { userId, key: { in: fresh } }, select: { key: true, unlockedAt: true } });
    const at = new Map(saved.map((r) => [r.key, r.unlockedAt]));
    for (const p of progress) if (at.has(p.key)) p.unlockedAt = at.get(p.key) ?? now;
  }
  return { defs, progress, settings };
}

/** Succès débloqués et actifs (compteur du profil), sans recalcul. */
export async function countUnlocked(userId: string): Promise<{ unlocked: number; total: number } | null> {
  const settings = await getAchievementSettings();
  if (!settings.enabled) return null;
  const defs = activeAchievements(settings.disabled);
  const keys = defs.map((a) => a.key);
  const unlocked = await prisma.userAchievement.count({ where: { userId, key: { in: keys } } });
  return { unlocked, total: defs.length };
}
