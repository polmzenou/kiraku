"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { listNotifications, notificationsSince, type NotificationView } from "../social/queries";
import { getCurrentUser } from "../user";

// Notifications du joueur connecté. Ordre : session → Zod → rate limit ; la propriété est dans
// chaque requête (userId de la session), jamais un id de joueur venu du client.

type Failure = { ok: false; error: "NO_SESSION" | "INVALID" | "RATE_LIMITED" };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const markSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(idSchema).min(1).max(50) })]);
const pageSchema = z.object({ cursor: idSchema.nullable() });

/** Marque comme lues des notifications du joueur (ou toutes). */
export async function markNotificationsReadAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`notif-read:${user.id}`, { limit: 30, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...("ids" in parsed.data ? { id: { in: parsed.data.ids } } : {}) },
    data: { readAt: new Date() },
  });
  refresh();
  return { ok: true };
}

/** Page suivante de /notifications (la première est rendue par le serveur). */
export async function loadNotificationsAction(
  input: unknown,
): Promise<{ ok: true; items: NotificationView[]; nextCursor: string | null } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`notif-page:${user.id}`, { limit: 30, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    return { ok: true, ...(await listNotifications(user.id, parsed.data.cursor)) };
  } catch {
    // Curseur d'une notification supprimée entre-temps : on repart du début
    return { ok: true, ...(await listNotifications(user.id, null)) };
  }
}

const pollSchema = z.object({ since: z.iso.datetime() });

export type PollResult =
  | { ok: true; count: number; items: NotificationView[]; more: number; now: string; pollSeconds: number }
  | Failure;

/**
 * Sondage de l'en-tête, tant que l'onglet est visible : compteur de la cloche et notifications
 * arrivées depuis `since` (affichées en toasts). `now` est l'heure du serveur, à renvoyer au
 * prochain sondage : l'horloge du téléphone n'entre jamais en jeu.
 */
export async function pollNotificationsAction(input: unknown): Promise<PollResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`notif-poll:${user.id}`, { limit: 12, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const now = new Date();
  // Jamais plus d'une heure en arrière : un onglet resté caché longtemps ne déverse pas tout
  const since = new Date(Math.max(new Date(parsed.data.since).getTime(), now.getTime() - 3_600_000));
  const [count, recent, pollSeconds] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    notificationsSince(user.id, since),
    getSetting("notifications.pollSeconds"),
  ]);
  return { ok: true, count, ...recent, now: now.toISOString(), pollSeconds };
}
