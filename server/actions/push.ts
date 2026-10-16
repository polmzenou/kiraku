"use server";

import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/push/subscription";
import { isFrozen } from "@/lib/account/deletion";
import { prisma } from "../db";
import { pushAvailable } from "../push/send";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Abonnement Web Push du navigateur courant. Ordre : session → Zod → rate limit ; la propriété :
// on n'écrit et ne supprime que des lignes du joueur de la session. Seuls l'endpoint et les deux
// clés sont lus dans l'entrée, champ par champ.

type Failure = { ok: false; error: "NO_SESSION" | "INVALID" | "GUEST" | "RATE_LIMITED" | "DISABLED" };

const MAX_PER_USER = 10; // téléphones, ordinateurs… au-delà, les plus anciens sont retirés
const RULE = { limit: 10, windowSeconds: 60 };

/** Enregistre (ou reprend) l'abonnement de ce navigateur pour le joueur connecté. */
export async function subscribePushAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  // Les invités n'ont pas de social, donc rien à leur notifier
  if (user.isGuest || isFrozen(user)) return { ok: false, error: "GUEST" };
  if (!(await rateLimit(`push-sub:${user.id}`, RULE)).success) return { ok: false, error: "RATE_LIMITED" };
  if (!(await pushAvailable())) return { ok: false, error: "DISABLED" };

  const { endpoint, keys } = parsed.data;
  // Langue des futurs push : celle de la page depuis laquelle le joueur s'abonne
  const current = await getLocale();
  const locale = (routing.locales as readonly string[]).includes(current) ? current : routing.defaultLocale;

  await prisma.$transaction(async (tx) => {
    // Un navigateur = un abonnement : s'il servait à un autre compte, il passe à celui-ci
    await tx.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, createdAt: new Date() },
    });
    const extra = await tx.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: MAX_PER_USER,
      select: { id: true },
    });
    if (extra.length > 0) await tx.pushSubscription.deleteMany({ where: { id: { in: extra.map((s) => s.id) } } });
    if (user.locale !== locale) await tx.user.update({ where: { id: user.id }, data: { locale } });
  });
  return { ok: true };
}

/** Retire l'abonnement de ce navigateur (seulement s'il appartient au joueur connecté). */
export async function unsubscribePushAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = pushEndpointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`push-sub:${user.id}`, RULE)).success) return { ok: false, error: "RATE_LIMITED" };
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });
  return { ok: true };
}
