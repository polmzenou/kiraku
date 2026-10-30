"use server";

import { refresh } from "next/cache";
import { hidesPresence, isStaff, shouldTouch, touchThreshold } from "@/lib/social/presence";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { requireActiveUser } from "../user";

// Présence du joueur connecté. Ordre : session → Zod → rôle → rate limit ; seul le compte de la
// session est écrit, et l'heure vient du serveur.

type Failure = { ok: false; error: "NO_SESSION" | "INVALID" | "FORBIDDEN" | "RATE_LIMITED" };

/**
 * Battement du navigateur, tant que le joueur est là : rafraîchit lastSeenAt au plus une fois par
 * demi-battement (conditionnel en base, plusieurs onglets n'écrivent pas deux fois). Rien pour un
 * invité ni pour l'équipe en hors ligne choisi : sa dernière activité reste figée.
 */
export async function presencePingAction(): Promise<{ ok: true } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`presence:${user.id}`, { limit: 6, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  if (user.isGuest || hidesPresence(user)) return { ok: true };
  const [now, heartbeatSeconds] = [new Date(), await getSetting("presence.heartbeatSeconds")];
  if (!shouldTouch(user.lastSeenAt, now, heartbeatSeconds)) return { ok: true };
  await prisma.user.updateMany({
    where: { id: user.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: touchThreshold(now, heartbeatSeconds) } }] },
    data: { lastSeenAt: now },
  });
  return { ok: true };
}

const offlineSchema = z.object({ offline: z.boolean() });

/**
 * « Apparaître hors ligne » (ADMIN et DEV). La dernière activité est posée à maintenant dans les deux
 * sens : « Déconnecté depuis 1 minute » à l'aller, en ligne tout de suite au retour.
 */
export async function setAppearOfflineAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = offlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!isStaff(user.role)) return { ok: false, error: "FORBIDDEN" };
  if (!(await rateLimit(`presence-offline:${user.id}`, { limit: 10, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { appearOffline: parsed.data.offline, lastSeenAt: new Date() },
  });
  refresh();
  return { ok: true };
}
