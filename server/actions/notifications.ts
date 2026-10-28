"use server";

import { expireTradesFor } from "../social/trade-core";
import { refresh } from "next/cache";
import { after } from "next/server";
import { isFrozen } from "@/lib/account/deletion";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { sweepBattlesFor } from "../battle/queries";
import { purgeOldMessages, unreadChatCount, visibleSince } from "../chat/queries";
import { settleDueFor } from "../market/queries";
import { getSetting } from "../settings";
import { listNotifications, notificationsSince, type NotificationView } from "../social/queries";
import { requireActiveUser } from "../user";

// Notifications du joueur connecté. Ordre : session → Zod → rate limit ; la propriété est dans
// chaque requête (userId de la session), jamais un id de joueur venu du client.

type Failure = { ok: false; error: "NO_SESSION" | "INVALID" | "RATE_LIMITED" };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const markSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(idSchema).min(1).max(50) })]);
const pageSchema = z.object({ cursor: idSchema.nullable() });

/** Marque comme lues des notifications du joueur (ou toutes). */
export async function markNotificationsReadAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await requireActiveUser();
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

/** Supprime toutes les notifications déjà lues du joueur. */
export async function deleteReadNotificationsAction(): Promise<{ ok: true; deleted: number } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`notif-clear:${user.id}`, { limit: 10, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const { count } = await prisma.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } });
  refresh();
  return { ok: true, deleted: count };
}

/** Page suivante de /notifications (la première est rendue par le serveur). */
export async function loadNotificationsAction(
  input: unknown,
): Promise<{ ok: true; items: NotificationView[]; nextCursor: string | null } | Failure> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`notif-page:${user.id}`, { limit: 30, windowSeconds: 60 }, { store: "memory" })).success) {
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
  | {
      ok: true;
      count: number;
      items: NotificationView[];
      more: number;
      now: string;
      pollSeconds: number;
      /** Délai de secours quand le temps réel est connecté. */
      safetySeconds: number;
      /** Messages de chat non lus, ou null si le chat n'est pas ouvert à ce joueur. */
      chatUnread: number | null;
    }
  | Failure;

/** Pastille du chat, dans le même sondage que la cloche (un appel au lieu de deux). */
async function chatUnreadFor(user: { id: string; isGuest: boolean; bannedAt: Date | null } & Parameters<typeof isFrozen>[0]) {
  if (user.isGuest || user.bannedAt || isFrozen(user)) return null;
  const [socialOn, chatOn, hours] = await Promise.all([getSetting("social.enabled"), getSetting("chat.enabled"), getSetting("chat.retentionHours")]);
  if (!socialOn || !chatOn) return null;
  // Ménage des messages expirés, au plus une fois toutes les 10 min par instance (compteur en mémoire,
  // sans écriture en base ; les lectures les ignorent déjà : ils disparaissent à l'heure dite, la suppression suit)
  if ((await rateLimit("chat:purge", { limit: 1, windowSeconds: 600 }, { store: "memory" })).success) after(() => purgeOldMessages(hours));
  return unreadChatCount(user.id, visibleSince(hours));
}

/**
 * Sondage unique de l'en-tête (« pulse »), tant que le joueur est là : compteur de la cloche,
 * notifications arrivées depuis `since` (affichées en toasts) et pastille du chat. `now` est l'heure
 * du serveur, à renvoyer au prochain sondage : l'horloge du téléphone n'entre jamais en jeu.
 */
export async function pollNotificationsAction(input: unknown): Promise<PollResult> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`notif-poll:${user.id}`, { limit: 12, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  // Balayages paresseux (écritures en base) au plus une fois par notifications.sweepSeconds et par
  // joueur, pas à chaque sondage ; les crons quotidiens et l'affichage des pages restent les filets de sécurité.
  const sweepSeconds = await getSetting("notifications.sweepSeconds");
  if ((await rateLimit(`notif-sweep:${user.id}`, { limit: 1, windowSeconds: sweepSeconds })).success) {
    // Ventes terminées du joueur closes avant de lire : « Tu as remporté… » arrive dans ce sondage
    try {
      await settleDueFor(user.id, new Date());
    } catch (e) {
      console.error("[marche] clôture au sondage", e);
    }
    // Combats oubliés du joueur (tour expiré, salle périmée, file abandonnée) : cartes rendues
    await sweepBattlesFor(user.id);
    // Propositions d'échange échues
    await expireTradesFor(prisma, user.id).catch((e) => console.error("[echanges] expiration au sondage", e));
  }
  const now = new Date();
  // Jamais plus d'une heure en arrière : un onglet resté caché longtemps ne déverse pas tout
  const since = new Date(Math.max(new Date(parsed.data.since).getTime(), now.getTime() - 3_600_000));
  const [count, recent, pollSeconds, safetySeconds, chatUnread] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    notificationsSince(user.id, since),
    getSetting("notifications.pollSeconds"),
    getSetting("realtime.safetyPollSeconds"),
    chatUnreadFor(user),
  ]);
  return { ok: true, count, ...recent, now: now.toISOString(), pollSeconds, safetySeconds, chatUnread };
}
