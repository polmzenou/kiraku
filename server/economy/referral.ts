import "server-only";
import { after } from "next/server";
import { cookies } from "next/headers";
import { normalizeReferralCode } from "@/lib/economy/referral";
import { prisma } from "../db";
import { isProduction } from "../env";
import { pushNotifications } from "../push/send";
import { clientIp, rateLimit } from "../ratelimit";
import { referralRules } from "./deps";
import { attachReferralWith, qualifyReferralsWith, ReferralError, type ReferralErrorCode } from "./referral-core";

// Parrainage côté serveur : cookie du lien d'invitation (/i/[code]) et rattachement à
// l'inscription. Le cookie ne contient que le code, jamais d'id ; rien n'est écrit en base avant
// que le filleul ait un compte.

export const REFERRAL_COOKIE = {
  name: isProduction ? "__Secure-kiraku.ref" : "kiraku.ref",
  maxAge: 30 * 24 * 60 * 60,
  options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction },
};

const DAY = 24 * 3600;

/** Code du lien d'invitation suivi sur cet appareil, s'il est valide. */
export async function pendingReferralCode(): Promise<string | null> {
  return normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE.name)?.value);
}

/**
 * Rattache un joueur au parrain d'un code. Limité par IP (3 rattachements par jour, rien n'est
 * stocké en base) : un même appareil ne fabrique pas une série de filleuls.
 */
export async function attachReferral(userId: string, code: string): Promise<{ ok: true } | { ok: false; error: ReferralErrorCode | "RATE_LIMITED" }> {
  if (!(await rateLimit(`referral-ip:${await clientIp()}`, { limit: 3, windowSeconds: DAY })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    await attachReferralWith(prisma, { refereeId: userId, code, now: new Date(), rules: await referralRules() });
    return { ok: true };
  } catch (e) {
    if (e instanceof ReferralError) return { ok: false, error: e.code };
    throw e;
  }
}

/**
 * À l'inscription (e-mail ou Discord) : rattache le code du lien d'invitation s'il y en a un, puis
 * oublie le cookie. Jamais bloquant : un code refusé n'empêche pas de créer son compte.
 */
export async function attachFromCookie(userId: string): Promise<void> {
  try {
    const code = await pendingReferralCode();
    if (!code) return;
    const result = await attachReferral(userId, code);
    if (result.ok || result.error !== "RATE_LIMITED") (await cookies()).delete(REFERRAL_COOKIE.name);
  } catch (e) {
    console.error("[parrainage] rattachement impossible", e);
  }
}

/** Qualification paresseuse des parrainages où ce joueur est parrain ou filleul (après la réponse). */
export function qualifyLater(userId: string): void {
  after(async () => {
    try {
      await qualifyReferralsWith(prisma, userId, await referralRules(), new Date(), (ids) => pushNotifications(ids));
    } catch (e) {
      console.error("[parrainage] qualification impossible", e);
    }
  });
}
