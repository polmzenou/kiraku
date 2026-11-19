import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SignalEvent } from "@/generated/prisma/client";
import { isDeviceId, isRecordableIp } from "@/lib/anticheat/signals";
import { prisma } from "../db";
import { isProduction } from "../env";
import { clientIp, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";

// Relevé des IP et appareils d'un joueur, pour la détection des multi-comptes (/admin/multi-comptes).
// L'appareil est un identifiant aléatoire dans un cookie de sécurité : il survit aux changements de compte
// sur le même navigateur, mais pas à la navigation privée ni à l'effacement des cookies.

export const DEVICE_COOKIE = {
  name: isProduction ? "__Secure-kiraku.device" : "kiraku.device",
  options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction, maxAge: 2 * 365 * 24 * 60 * 60 },
};

/** Identifiant de l'appareil, posé s'il manque (seulement là où les cookies s'écrivent : Server Actions, routes). */
async function deviceId(): Promise<string | null> {
  const jar = await cookies();
  const current = jar.get(DEVICE_COOKIE.name)?.value;
  if (isDeviceId(current)) return current;
  const fresh = randomBytes(16).toString("hex");
  try {
    jar.set(DEVICE_COOKIE.name, fresh, DEVICE_COOKIE.options);
    return fresh;
  } catch {
    return null; // rendu de page : cookies en lecture seule
  }
}

async function upsertSignal(userId: string, kind: "IP" | "DEVICE", value: string, event: SignalEvent) {
  await prisma.$executeRaw`
    INSERT INTO "UserSignal" ("id", "userId", "kind", "value", "firstEvent", "firstSeenAt", "lastSeenAt", "hits")
    VALUES (gen_random_uuid()::text, ${userId}, ${kind}::"SignalKind", ${value}, ${event}::"SignalEvent", now(), now(), 1)
    ON CONFLICT ("userId", "kind", "value") DO UPDATE SET "lastSeenAt" = now(), "hits" = "UserSignal"."hits" + 1`;
}

/**
 * Note l'IP et l'appareil de la requête pour ce joueur. Ne lève jamais : une connexion ou un battement
 * n'échoue pas à cause du relevé (échec dans les logs seulement).
 */
export async function recordSignals(userId: string, event: SignalEvent): Promise<void> {
  try {
    const [ip, device] = await Promise.all([clientIp(), deviceId()]);
    await Promise.all([
      isRecordableIp(ip) ? upsertSignal(userId, "IP", ip, event) : null,
      device ? upsertSignal(userId, "DEVICE", device, event) : null,
    ]);
  } catch (e) {
    console.error("[signals] relevé", e instanceof Error ? e.message : e);
  }
}

/** Relevé du battement de présence : au plus une fois par multiAccount.seenThrottleMinutes et par joueur. */
export async function recordSeenSignals(userId: string): Promise<void> {
  try {
    const minutes = await getSetting("multiAccount.seenThrottleMinutes");
    const { success } = await rateLimit(`signal:${userId}`, { limit: 1, windowSeconds: minutes * 60 }, { store: "memory" });
    if (success) await recordSignals(userId, "SEEN");
  } catch (e) {
    console.error("[signals] présence", e instanceof Error ? e.message : e);
  }
}

/** Ménage quotidien : signaux non revus depuis multiAccount.retentionDays. */
export async function purgeOldSignals(now: Date): Promise<number> {
  const days = await getSetting("multiAccount.retentionDays");
  const { count } = await prisma.userSignal.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - days * 86_400_000) } } });
  return count;
}
