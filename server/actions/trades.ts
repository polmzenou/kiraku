"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { after } from "next/server";
import type { OpenedCardView } from "@/lib/boosters/view";
import { z } from "@/lib/zod";
import { USERNAME_REGEX } from "@/lib/username";
import { isFrozen } from "@/lib/account/deletion";
import type { TradeRules } from "@/lib/social/trades";
import { cardViews } from "../boosters/display";
import { findProfileOwner } from "../collection/profile";
import { prisma } from "../db";
import { pushNotifications } from "../push/send";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import {
  acceptTradeWith,
  cancelTradeWith,
  declineTradeWith,
  markTradesSeenWith,
  proposeTradeWith,
  TradeError,
  type TradeErrorCode,
} from "../social/trade-core";
import { getCurrentUser } from "../user";

// Échanges entre amis. Ordre des contrôles : session → Zod → compte inscrit non banni →
// interrupteurs → rate limit → propriété et règles relues sous verrou (server/social/trade-core.ts).
// Le client n'envoie que des ids de cartes et un pseudo ; les exemplaires sont choisis par le serveur.

export type TradeActionError = TradeErrorCode | "NO_SESSION" | "INVALID" | "GUEST" | "DISABLED" | "RATE_LIMITED" | "UNAVAILABLE";
type Failure = { ok: false; error: TradeActionError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const proposeSchema = z.object({ username: z.string().regex(USERNAME_REGEX), wantedCardId: id, offeredCardIds: z.array(id).min(1).max(10) }).strict();
const acceptSchema = z.object({ tradeId: id, chosenCardId: id }).strict();
const tradeIdSchema = z.object({ tradeId: id }).strict();
const seenSchema = z.object({ tradeIds: z.array(id).min(1).max(50) }).strict();

const pushLater = (ids: string[]) => after(() => pushNotifications(ids));

async function tradeRules(): Promise<TradeRules> {
  const [expiryHours, maxOffered, maxPendingSent, perDay, allowedRarities] = await Promise.all([
    getSetting("trades.expiryHours"),
    getSetting("trades.maxOffered"),
    getSetting("trades.maxPendingSent"),
    getSetting("trades.perDay"),
    getSetting("trades.allowedRarities"),
  ]);
  return { expiryHours, maxOffered, maxPendingSent, perDay, allowedRarities };
}

/** Session, schéma, compte inscrit non banni, interrupteurs, rate limit. */
async function guard<S extends z.ZodType>(input: unknown, schema: S, bucket: string, rule: { limit: number; windowSeconds: number }) {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  if (user.isGuest) return { error: "GUEST" as const };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" as const };
  if (!(await getSetting("social.enabled")) || !(await getSetting("trades.enabled"))) return { error: "DISABLED" as const };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" as const };
  return { user, data: parsed.data as z.infer<S> };
}

function failure(e: unknown): Failure {
  if (e instanceof TradeError) return { ok: false, error: e.code };
  console.error("[echanges] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Propose à un ami : sa carte `wantedCardId` contre l'une des `offeredCardIds`. */
export async function proposeTradeAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, proposeSchema, "trade-propose", { limit: 10, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const owner = await findProfileOwner(g.data.username);
  if (!owner) return { ok: false, error: "NOT_FRIENDS" };
  try {
    await proposeTradeWith(
      prisma,
      { proposerId: g.user.id, recipientId: owner.id, wantedCardId: g.data.wantedCardId, offeredCardIds: g.data.offeredCardIds, rules: await tradeRules() },
      pushLater,
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Accepte une proposition reçue en choisissant une des cartes offertes ; renvoie la carte à révéler. */
export async function acceptTradeAction(input: unknown): Promise<{ ok: true; card: OpenedCardView } | Failure> {
  const g = await guard(input, acceptSchema, "trade-respond", { limit: 20, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const res = await acceptTradeWith(
      prisma,
      { userId: g.user.id, tradeId: g.data.tradeId, chosenCardId: g.data.chosenCardId, allowedRarities: await getSetting("trades.allowedRarities") },
      pushLater,
    );
    refresh();
    if (!res.ok) return { ok: false, error: res.code };
    const view = (await cardViews([res.received.cardId], await getLocale())).get(res.received.cardId);
    if (!view) return { ok: false, error: "UNAVAILABLE" };
    return { ok: true, card: { ...view, userCardId: res.received.userCardId, isNew: res.received.isNew, wished: res.received.wished, featured: false } };
  } catch (e) {
    return failure(e);
  }
}

export async function declineTradeAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, tradeIdSchema, "trade-respond", { limit: 20, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await declineTradeWith(prisma, { userId: g.user.id, tradeId: g.data.tradeId }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function cancelTradeAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, tradeIdSchema, "trade-respond", { limit: 20, windowSeconds: 60 });
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await cancelTradeWith(prisma, { userId: g.user.id, tradeId: g.data.tradeId });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Le proposant a vu la révélation de ses cartes reçues : elle ne se rejoue plus. */
export async function markTradesSeenAction(input: unknown): Promise<{ ok: true } | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = seenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`trade-seen:${user.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  await markTradesSeenWith(prisma, { userId: user.id, tradeIds: parsed.data.tradeIds });
  return { ok: true };
}
