import "server-only";
import { after } from "next/server";
import { cookies } from "next/headers";
import { snowflakeDate } from "@/lib/discord/snowflake";
import { parseInviteCode } from "@/lib/referral/codes";
import { REFERRAL_COOKIE_MAX_AGE, referralCookieName } from "@/lib/referral/cookie";
import { prisma } from "../db";
import { isProduction } from "../env";
import { pushNotifications } from "../push/send";
import { clientIp, rateLimit } from "../ratelimit";
import { attachReferralV2With, ReferralV2Error, type AttachV2Refusal } from "../referral/attach-core";
import { progressDeps, referralFingerprintKey, referralV2Rules } from "../referral/deps";
import { recordFingerprints, refereeFingerprints } from "../referral/fingerprint";
import { openReferralIdsOf, progressReferralWith } from "../referral/progress-core";
import { getSetting } from "../settings";
import { referralRules } from "./deps";
import { attachReferralWith, qualifyReferralsWith, ReferralError, type ReferralErrorCode } from "./referral-core";
import { ennichiAttachNow } from "../ennichi/deps";

// Parrainage côté serveur : cookie du lien d'invitation (/i/[code]) et rattachement à l'inscription. Le cookie ne
// contient que le code, jamais d'id ; rien n'est écrit en base avant que le filleul ait un compte. Interrupteur
// referral.v2.enabled allumé : rattachement, étapes et versements du parrainage v2 (server/referral/*) ; coupé, la v1.

/** Cookie du lien d'invitation, posé par proxy.ts (/i/CODE et ?ref=CODE), voir lib/referral/cookie.ts. */
export const REFERRAL_COOKIE = {
  name: referralCookieName(isProduction),
  maxAge: REFERRAL_COOKIE_MAX_AGE,
  options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction },
};

const DAY = 24 * 3600;

/** Code du lien d'invitation suivi sur cet appareil, s'il est valide (code standard ou code perso). */
export async function pendingReferralCode(): Promise<string | null> {
  return parseInviteCode((await cookies()).get(REFERRAL_COOKIE.name)?.value)?.code ?? null;
}

export type AttachError = ReferralErrorCode | AttachV2Refusal | "RATE_LIMITED";

/**
 * Rattache un joueur au parrain d'un code. Limité par IP (3 rattachements par jour, rien n'est
 * stocké en base) : un même appareil ne fabrique pas une série de filleuls.
 */
export async function attachReferral(userId: string, code: string): Promise<{ ok: true } | { ok: false; error: AttachError }> {
  if (!(await rateLimit(`referral-ip:${await clientIp()}`, { limit: 3, windowSeconds: DAY })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    if (await getSetting("referral.v2.enabled")) {
      const [rules, attachWindowDays, ennichi] = await Promise.all([referralV2Rules(), getSetting("referral.attachWindowDays"), ennichiAttachNow()]);
      const { referralId } = await attachReferralV2With(prisma, {
        refereeId: userId,
        code,
        now: new Date(),
        rules,
        attachWindowDays,
        // Ennichi : un ami qui arrive pendant la fête porte l'édition (lanterne, banzuke, omikuji) et le multiplicateur
        // du moment (×2 des étapes 1 et 2, figé) ; plafond levé si réglé
        ennichiEdition: ennichi.edition,
        ennichiMultiplier: ennichi.multiplier,
        ennichiLiftCap: ennichi.liftCap,
        fingerprintKey: referralFingerprintKey(),
      });
      progressLater([referralId]);
    } else {
      await attachReferralWith(prisma, { refereeId: userId, code, now: new Date(), rules: await referralRules() });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof ReferralError || e instanceof ReferralV2Error) return { ok: false, error: e.code };
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

/** Avance des parrainages v2 après la réponse (étapes, contrôles, versements, notifications). */
function progressLater(referralIds: readonly string[]): void {
  if (referralIds.length === 0) return;
  after(async () => {
    try {
      const deps = await progressDeps();
      for (const id of referralIds) await progressReferralWith(prisma, id, deps);
    } catch (e) {
      console.error("[parrainage] avancement impossible", e);
    }
  });
}

/**
 * Avancement paresseux des parrainages où ce joueur est parrain ou filleul (après la réponse) : qualification v1, et
 * en v2 étapes et versements, au plus une fois par minute et par joueur (une ouverture de booster en déclenche un).
 */
export function qualifyLater(userId: string): void {
  after(async () => {
    try {
      await qualifyReferralsWith(prisma, userId, await referralRules(), new Date(), (ids) => pushNotifications(ids));
      if (!(await getSetting("referral.v2.enabled"))) return;
      if (!(await rateLimit(`referral-progress:${userId}`, { limit: 1, windowSeconds: 60 })).success) return;
      const ids = await openReferralIdsOf(prisma, userId);
      if (ids.length === 0) return;
      const deps = await progressDeps();
      for (const id of ids) await progressReferralWith(prisma, id, deps);
    } catch (e) {
      console.error("[parrainage] qualification impossible", e);
    }
  });
}

/**
 * Visite de /parrainage par un filleul v2 : son parrainage avance avant la lecture, pour que la page montre ses étapes
 * et ses cadeaux à jour (au plus 3 fois par minute). Ceux où il est parrain avancent après la réponse (qualifyLater).
 * Jamais bloquant.
 */
export async function progressOwnReferral(userId: string): Promise<void> {
  try {
    const own = await prisma.referral.findUnique({ where: { refereeId: userId }, select: { id: true, version: true, revokedAt: true, step4At: true } });
    if (!own || own.version !== 2 || own.revokedAt || own.step4At) return;
    if (!(await rateLimit(`referral-self:${userId}`, { limit: 3, windowSeconds: 60 })).success) return;
    await progressReferralWith(prisma, own.id, await progressDeps());
  } catch (e) {
    console.error("[parrainage] avancement impossible", e);
  }
}

/**
 * Liaison Discord d'un filleul v2 : date de son compte Discord (confiance : un Discord ancien libère tout de suite la
 * part « confiance » de son parrain), empreinte gardée, puis avancement. Jamais bloquant.
 */
export async function referralDiscordLinked(userId: string, discordId: string): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({ where: { refereeId: userId }, select: { id: true, version: true, discordCreatedAt: true, revokedAt: true } });
    if (!referral || referral.version !== 2 || referral.revokedAt) return;
    if (!referral.discordCreatedAt) {
      await prisma.referral.update({ where: { id: referral.id }, data: { discordCreatedAt: snowflakeDate(discordId) }, select: { id: true } });
    }
    await prisma.$transaction((tx) => recordFingerprints(tx, refereeFingerprints({ discordId, email: null }, referralFingerprintKey()), referral.id));
    progressLater([referral.id]);
  } catch (e) {
    console.error("[parrainage] liaison Discord non prise en compte", e);
  }
}
