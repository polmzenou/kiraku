"use server";

import { achievementByKey } from "@/lib/achievements/catalog";
import { isFrozen } from "@/lib/account/deletion";
import { z } from "@/lib/zod";
import { getAchievementSettings } from "../achievements/sync";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Succès mis en avant sous l'avatar. Session → Zod → compte inscrit actif → propriété (succès débloqué et actif)
// → rate limit ; seul le champ featuredAchievement est écrit. null retire la mise en avant.

export type FeatureAchievementError = "NO_SESSION" | "INVALID" | "GUEST" | "UNAVAILABLE" | "LOCKED" | "RATE_LIMITED";

const featureSchema = z
  .object({
    key: z
      .string()
      .max(40)
      .refine((key) => achievementByKey(key) !== undefined)
      .nullable(),
  })
  .strict();

export async function featureAchievementAction(input: unknown): Promise<{ ok: true } | { ok: false; error: FeatureAchievementError }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = featureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (user.isGuest) return { ok: false, error: "GUEST" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };

  const { key } = parsed.data;
  if (key !== null) {
    const settings = await getAchievementSettings();
    if (!settings.enabled || settings.disabled.includes(key)) return { ok: false, error: "LOCKED" };
    const owned = await prisma.userAchievement.findUnique({ where: { userId_key: { userId: user.id, key } }, select: { key: true } });
    if (!owned) return { ok: false, error: "LOCKED" };
  }
  if (!(await rateLimit(`achievement-feature:${user.id}`, { limit: 10, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  await prisma.user.update({ where: { id: user.id }, data: { featuredAchievement: key }, select: { id: true } });
  // Pas de refresh() : la grille de /succes garde la mise en avant dans son état, et un nouveau rendu y relancerait
  // tout le calcul des succès (syncAchievements, une quarantaine de requêtes) pour rien. Le profil, seul autre écran
  // qui l'affiche, est relu à la prochaine visite.
  return { ok: true };
}
