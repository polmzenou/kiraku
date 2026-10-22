import "server-only";
import { getTranslations } from "next-intl/server";
import webpush from "web-push";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { isExpiredPush, safePushPath, type PushMessage } from "@/lib/push/subscription";
import { describeNotification } from "@/lib/social/describe";
import { prisma } from "../db";
import { env, pushConfigured } from "../env";
import { getSetting } from "../settings";
import { notificationForPush } from "../social/queries";

// Envoi Web Push, toujours après la transaction qui a créé la notification (jamais dedans : un
// service push lent ne doit pas tenir de verrou). On relit la notification en base : si la
// transaction a été annulée, ou si le joueur l'a déjà lue, rien ne part.

const TTL_SECONDS = 24 * 3600; // une notification de plus d'un jour n'a plus d'intérêt
const TIMEOUT_MS = 5000;

if (pushConfigured) webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

/** Le Web Push est-il proposé aux joueurs (clés VAPID présentes et interrupteur de l'admin) ? */
export async function pushAvailable(): Promise<boolean> {
  return pushConfigured && (await getSetting("notifications.pushEnabled"));
}

function asLocale(value: string): Locale {
  return (routing.locales as readonly string[]).includes(value) ? (value as Locale) : routing.defaultLocale;
}

async function renderMessage(notificationId: string, locale: Locale): Promise<{ userId: string; message: PushMessage } | null> {
  const view = await notificationForPush(notificationId);
  if (!view) return null;
  const [t, tAccount, tRarity] = await Promise.all([
    getTranslations({ locale, namespace: "notifications" }),
    getTranslations({ locale, namespace: "account" }),
    getTranslations({ locale, namespace: "rarity" }),
  ]);
  const { text, href } = describeNotification(view, {
    // Les clés sont celles de DescribeTranslators (toutes présentes) : l'union est trop large pour
    // l'inférence des arguments ICU de getTranslations, d'où la signature simplifiée
    notifications: (key, values) => (t as (k: string, v?: Record<string, string | number>) => string)(key, values),
    guestName: (code) => tAccount("guestName", { code }),
    rarity: (r) => tRarity(r as "COMMON"),
  });
  return {
    userId: view.userId,
    // Même tag pour un même type : une rafale de demandes remplace la précédente au lieu d'empiler
    message: { title: t("push.title"), body: view.note ? t("push.withNote", { text, note: view.note }) : text, url: safePushPath(getPathname({ href, locale })), tag: view.type },
  };
}

async function pushOne(notificationId: string) {
  const head = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { user: { select: { locale: true, pushSubs: { select: { id: true, endpoint: true, p256dh: true, auth: true } } } } },
  });
  const subs = head?.user.pushSubs ?? [];
  if (subs.length === 0) return;
  const rendered = await renderMessage(notificationId, asLocale(head!.user.locale));
  if (!rendered) return;
  const payload = JSON.stringify(rendered.message);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: TTL_SECONDS,
          timeout: TIMEOUT_MS,
          urgency: "normal",
        });
        await prisma.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
      } catch (e) {
        const status = e instanceof webpush.WebPushError ? e.statusCode : undefined;
        if (isExpiredPush(status)) {
          await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        } else {
          // Hôte du service seulement : l'endpoint complet identifie le navigateur
          console.warn(`[push] échec (${status ?? "réseau"}) vers ${new URL(sub.endpoint).hostname}`);
        }
      }
    }),
  );
}

/** Envoie le push de chaque notification créée ; ne lève jamais (le jeu ne dépend pas du push). */
export async function pushNotifications(notificationIds: readonly string[]): Promise<void> {
  if (notificationIds.length === 0 || !(await pushAvailable())) return;
  await Promise.all(
    notificationIds.map((id) =>
      pushOne(id).catch((e: unknown) => console.warn("[push] erreur inattendue", e instanceof Error ? e.message : e)),
    ),
  );
}
