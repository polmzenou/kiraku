"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "@/lib/zod";
import { USERNAME_REGEX } from "@/lib/username";
import { isFrozen } from "@/lib/account/deletion";
import { findProfileOwner } from "../collection/profile";
import { prisma } from "../db";
import { pushNotifications } from "../push/send";
import { clientIp, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import {
  blockWith,
  cancelWith,
  removeFriendWith,
  respondWith,
  sendRequestWith,
  SocialError,
  unblockWith,
  type FriendLimits,
  type SendOutcome,
} from "../social/friendship-core";
import { GiftError, giftBoosterWith, giftCardWith, giftSealedWith, type GiftErrorCode } from "../social/gift-core";
import { getCurrentUser } from "../user";

// Amis, blocage et cadeaux. Ordre des contrôles : session → Zod → compte autorisé (ni invité ni
// banni) → rate limit → propriété et règles relues sous verrou dans la transaction (server/social).
// Le client n'envoie qu'un pseudo et, pour un cadeau, un id de Card : le serveur choisit le reste.

export type SocialActionError =
  | "NO_SESSION"
  | "INVALID"
  | "GUEST"
  | "DISABLED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SELF"
  | "BLOCKED_BY_ME"
  | "LIMIT_FRIENDS"
  | "LIMIT_OUTGOING"
  | "UNAVAILABLE";

type Failure<E extends string = SocialActionError> = { ok: false; error: E };

const HOUR = 3600;
const usernameSchema = z.object({ username: z.string().regex(USERNAME_REGEX) });
const respondSchema = usernameSchema.extend({ accept: z.boolean() });
const giftCardSchema = usernameSchema.extend({ cardId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });
const giftSealedSchema = usernameSchema.extend({ drop: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) });

/** Web Push des notifications créées, une fois la réponse envoyée (hors transaction). */
const pushLater = (ids: string[]) => after(() => pushNotifications(ids));

async function friendLimits(): Promise<FriendLimits> {
  const [maxFriends, maxOutgoing, cooldownHours] = await Promise.all([
    getSetting("friends.max"),
    getSetting("friends.maxOutgoingPending"),
    getSetting("friends.requestCooldownHours"),
  ]);
  return { maxFriends, maxOutgoing, cooldownHours };
}

/** Session, schéma, compte inscrit non banni, interrupteur social, rate limit. */
async function guard<S extends z.ZodType>(input: unknown, schema: S, bucket: string, rule: { limit: number; windowSeconds: number }) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  // Invités exclus du social : ils se créent en série, ce serait l'outil idéal du spam
  if (user.isGuest) return { error: "GUEST" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  if (!(await getSetting("social.enabled"))) return { error: "DISABLED" as const };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" as const };
  return { user, data: parsed.data as z.infer<S> };
}

/** Joueur cible par pseudo exact (casse ignorée). Jamais de recherche approximative sur tous les joueurs. */
async function target(username: string) {
  const owner = await findProfileOwner(username);
  return owner ? owner.id : null;
}

function socialFailure(e: unknown): Failure {
  if (e instanceof SocialError) {
    switch (e.code) {
      case "NOT_FOUND":
      case "SELF":
      case "BLOCKED_BY_ME":
      case "LIMIT_FRIENDS":
      case "LIMIT_OUTGOING":
      case "GUEST":
        return { ok: false, error: e.code };
      default:
        return { ok: false, error: "UNAVAILABLE" };
    }
  }
  console.error("[social] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

// --- Demandes d'amis ---

export type SendResult = { ok: true; status: SendOutcome } | Failure;

/**
 * Demande d'ami par pseudo exact. Seuls « introuvable » et « déjà amis / demande en cours »
 * diffèrent de « envoyée » : un blocage, un refus, un compte invité ou plein répondent « envoyée ».
 */
export async function sendFriendRequestAction(input: unknown): Promise<SendResult> {
  const g = await guard(input, usernameSchema, "friend-req", { limit: 10, windowSeconds: HOUR });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  // Par jour et par IP en plus : un même appareil ne balaie pas les pseudos avec plusieurs comptes
  const [daily, byIp] = await Promise.all([
    rateLimit(`friend-req-day:${g.user.id}`, { limit: 30, windowSeconds: 24 * HOUR }),
    rateLimit(`friend-req-ip:${await clientIp()}`, { limit: 30, windowSeconds: HOUR }),
  ]);
  if (!daily.success || !byIp.success) return { ok: false, error: "RATE_LIMITED" };

  const targetId = await target(g.data.username);
  if (!targetId) return { ok: false, error: "NOT_FOUND" };
  try {
    const status = await sendRequestWith(prisma, g.user.id, targetId, await friendLimits(), pushLater);
    refresh();
    return { ok: true, status };
  } catch (e) {
    return socialFailure(e);
  }
}

type SimpleResult = { ok: true } | Failure;

async function simple<S extends z.ZodType<{ username: string }>>(
  input: unknown,
  schema: S,
  bucket: string,
  rule: { limit: number; windowSeconds: number },
  run: (userId: string, targetId: string, data: z.infer<S>) => Promise<void>,
): Promise<SimpleResult> {
  const g = await guard(input, schema, bucket, rule);
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const targetId = await target(g.data.username);
  if (!targetId) return { ok: false, error: "NOT_FOUND" };
  try {
    await run(g.user.id, targetId, g.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return socialFailure(e);
  }
}

const PER_MINUTE_30 = { limit: 30, windowSeconds: 60 };
const PER_MINUTE_20 = { limit: 20, windowSeconds: 60 };

/** Accepte ou refuse (en silence) une demande reçue. */
export async function respondFriendRequestAction(input: unknown): Promise<SimpleResult> {
  return simple(input, respondSchema, "friend-respond", PER_MINUTE_30, async (me, other, data) =>
    respondWith(prisma, me, other, data.accept, await friendLimits(), pushLater),
  );
}

export async function cancelFriendRequestAction(input: unknown): Promise<SimpleResult> {
  return simple(input, usernameSchema, "friend-cancel", PER_MINUTE_30, async (me, other) =>
    cancelWith(prisma, me, other, await friendLimits()),
  );
}

export async function removeFriendAction(input: unknown): Promise<SimpleResult> {
  return simple(input, usernameSchema, "friend-remove", PER_MINUTE_30, async (me, other) =>
    removeFriendWith(prisma, me, other, await friendLimits()),
  );
}

export async function blockUserAction(input: unknown): Promise<SimpleResult> {
  return simple(input, usernameSchema, "block", PER_MINUTE_20, (me, other) => blockWith(prisma, me, other));
}

export async function unblockUserAction(input: unknown): Promise<SimpleResult> {
  return simple(input, usernameSchema, "block", PER_MINUTE_20, (me, other) => unblockWith(prisma, me, other));
}

// --- Cadeaux ---

export type GiftActionError = SocialActionError | Exclude<GiftErrorCode, "NO_USER" | "GUEST" | "BANNED" | "DISABLED">;
export type GiftResult = { ok: true } | Failure<GiftActionError>;

async function giftRules() {
  const [enabled, perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, timeZone] = await Promise.all([
    getSetting("gifts.enabled"),
    getSetting("gifts.perDaySent"),
    getSetting("gifts.perDayReceived"),
    getSetting("gifts.minAccountAgeHours"),
    getSetting("gifts.minFriendshipHours"),
    getSetting("game.timeZone"),
  ]);
  return { rules: { enabled, perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours }, timeZone };
}

function giftFailure(e: unknown): Failure<GiftActionError> {
  if (e instanceof GiftError) {
    switch (e.code) {
      case "NO_USER":
      case "BANNED":
        return { ok: false, error: "UNAVAILABLE" };
      default:
        return { ok: false, error: e.code };
    }
  }
  console.error("[social] cadeau impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

async function giftGuard<S extends z.ZodType<{ username: string }>>(input: unknown, schema: S) {
  const g = await guard(input, schema, "gift", { limit: 10, windowSeconds: 60 });
  if ("error" in g) return { error: g.error ?? ("INVALID" as const) };
  const recipientId = await target(g.data.username);
  // Un pseudo inconnu répond comme un joueur qui n'est pas ton ami
  if (!recipientId) return { error: "NOT_FRIENDS" as const };
  return { user: g.user, data: g.data, recipientId, ...(await giftRules()) };
}

/** Offre un exemplaire d'une carte (id de Card) à un ami. */
export async function giftCardAction(input: unknown): Promise<GiftResult> {
  const g = await giftGuard(input, giftCardSchema);
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await giftCardWith(prisma, {
      senderId: g.user.id,
      recipientId: g.recipientId,
      cardId: (g.data as z.infer<typeof giftCardSchema>).cardId,
      rules: g.rules,
      timeZone: g.timeZone,
      allowedRarities: await getSetting("gifts.allowedRarities"),
    }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return giftFailure(e);
  }
}

/** Offre un booster standard, payé en Zeni au prix fixé dans l'admin. */
export async function giftBoosterAction(input: unknown): Promise<GiftResult> {
  const g = await giftGuard(input, usernameSchema);
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await giftBoosterWith(prisma, {
      senderId: g.user.id,
      recipientId: g.recipientId,
      rules: g.rules,
      timeZone: g.timeZone,
      price: await getSetting("gifts.boosterPriceZeni"),
    }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return giftFailure(e);
  }
}

/** Offre un sachet scellé tombé d'un tirage (une seule fois) ; propriété et règles relues sous verrou. */
export async function giftSealedAction(input: unknown): Promise<GiftResult> {
  const g = await giftGuard(input, giftSealedSchema);
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const [requiresDiscord, minAccountDays, perWeek] = await Promise.all([
    getSetting("gifts.sealedRequiresDiscord"),
    getSetting("gifts.sealedMinAccountDays"),
    getSetting("gifts.sealedPerWeek"),
  ]);
  try {
    await giftSealedWith(prisma, {
      senderId: g.user.id,
      recipientId: g.recipientId,
      rules: g.rules,
      timeZone: g.timeZone,
      dropId: (g.data as z.infer<typeof giftSealedSchema>).drop,
      sealedRules: { requiresDiscord, minAccountDays, perWeek },
    }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return giftFailure(e);
  }
}
