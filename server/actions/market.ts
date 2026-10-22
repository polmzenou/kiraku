"use server";

import { getRarities } from "@/server/catalog/rarities";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { noteSchema } from "@/lib/text/plain";
import { z } from "@/lib/zod";
import { decodeMarketCursor, parseMarketParams } from "@/lib/market/filters";
import { isFrozen } from "@/lib/account/deletion";
import { prisma } from "../db";
import { adminCancelAuctionWith, AuctionError, buyNowWith, cancelAuctionWith, createAuctionWith, placeBidWith } from "../market/auction-core";
import { auctionLive, getMarketRules, listAuctions, pushLater, type AuctionListItem, type AuctionLive } from "../market/queries";
import { getAdmin } from "../admin";
import { rateLimit } from "../ratelimit";
import { getCurrentUser, requireActiveUser } from "../user";

// Hôtel des ventes. Ordre des contrôles : session → Zod → compte autorisé → rate limit, puis tout
// est relu sous verrou dans la transaction (server/market/auction-core.ts). Le client n'envoie que
// des ids, la mise qu'il propose, le prix qu'il a vu et une durée de la liste : montants, soldes,
// propriété et fin de vente sont décidés ici.

export type MarketActionError =
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "DISABLED"
  | "GUEST"
  | "TOO_NEW"
  | "INVALID_PRICE"
  | "INVALID_BUYOUT"
  | "INVALID_DURATION"
  | "NOT_OWNED"
  | "TOO_MANY_ACTIVE"
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_AUCTION"
  | "ALREADY_LEADING"
  | "TOO_LOW"
  | "CAP_REACHED"
  | "NOT_ENOUGH_ZENI"
  | "HAS_BIDS"
  | "NO_BUYOUT"
  | "STALE";

type Failure = { ok: false; error: MarketActionError };

const MINUTE = 60;
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const zeni = z.number().int().min(1).max(100_000_000);

type Player = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function session(
  bucket: string,
  rule: { limit: number; windowSeconds: number },
): Promise<{ user: Player } | { error: "NO_SESSION" | "UNAVAILABLE" | "RATE_LIMITED" | "GUEST" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" };
  // Invités en consultation seule ; la transaction le revérifie
  if (user.isGuest) return { error: "GUEST" };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" };
  return { user };
}

function failure(scope: string, e: unknown): Failure {
  if (e instanceof AuctionError) {
    // Ces refus ne concernent jamais le joueur lui-même : message générique
    if (e.code === "NO_USER" || e.code === "BANNED") return { ok: false, error: "UNAVAILABLE" };
    return { ok: false, error: e.code };
  }
  console.error(`[marche] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

// --- Mise en vente ---

export type CreateAuctionResult = { ok: true; auctionId: string } | Failure;

const createSchema = z
  .object({
    cardId: idSchema,
    startPrice: zeni,
    buyoutPrice: zeni.nullable(),
    durationHours: z.number().int().min(1).max(24 * 14),
    note: noteSchema,
  })
  .strict();

export async function createAuctionAction(input: unknown): Promise<CreateAuctionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("market-sell", { limit: 10, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    // Propriété : le vendeur est toujours le joueur de la session, l'exemplaire est choisi en base
    const { auctionId } = await createAuctionWith(prisma, {
      sellerId: g.user.id,
      cardId: parsed.data.cardId,
      startPrice: parsed.data.startPrice,
      buyoutPrice: parsed.data.buyoutPrice,
      durationHours: parsed.data.durationHours,
      note: parsed.data.note,
      now: new Date(),
      rules: await getMarketRules(),
    });
    refresh();
    return { ok: true, auctionId };
  } catch (e) {
    return failure("mise en vente", e);
  }
}

// --- Mises ---

export type BidResult = { ok: true; coins: number; sold: boolean; live: AuctionLive | null } | Failure;

const bidSchema = z.object({ auctionId: idSchema, amount: zeni }).strict();

export async function placeBidAction(input: unknown): Promise<BidResult> {
  const parsed = bidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("market-bid", { limit: 30, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const now = new Date();
    const res = await placeBidWith(
      prisma,
      { bidderId: g.user.id, auctionId: parsed.data.auctionId, amount: parsed.data.amount, now, rules: await getMarketRules() },
      pushLater,
    );
    refresh();
    return { ok: true, coins: res.coins, sold: res.sold, live: await auctionLive(parsed.data.auctionId, g.user.id, now) };
  } catch (e) {
    return failure("mise", e);
  }
}

const buyNowSchema = z.object({ auctionId: idSchema, expectedPrice: zeni }).strict();

export async function buyNowAction(input: unknown): Promise<BidResult> {
  const parsed = buyNowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("market-bid", { limit: 30, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const now = new Date();
    const res = await buyNowWith(
      prisma,
      { buyerId: g.user.id, auctionId: parsed.data.auctionId, expectedPrice: parsed.data.expectedPrice, now, rules: await getMarketRules() },
      pushLater,
    );
    refresh();
    return { ok: true, coins: res.coins, sold: res.sold, live: await auctionLive(parsed.data.auctionId, g.user.id, now) };
  } catch (e) {
    return failure("achat immédiat", e);
  }
}

// --- Annulation ---

export type SimpleMarketResult = { ok: true } | Failure;

const auctionSchema = z.object({ auctionId: idSchema }).strict();

export async function cancelAuctionAction(input: unknown): Promise<SimpleMarketResult> {
  const parsed = auctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("market-cancel", { limit: 10, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    // Propriété vérifiée dans la même requête que l'écriture (sellerId dans la condition)
    await cancelAuctionWith(prisma, { sellerId: g.user.id, auctionId: parsed.data.auctionId, now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("annulation", e);
  }
}

/** Annulation par la modération : la mise en tête est rendue. Rôle admin revérifié ici. */
export async function adminCancelAuctionAction(input: unknown): Promise<SimpleMarketResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "UNAVAILABLE" };
  const parsed = auctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await adminCancelAuctionWith(prisma, { adminId: admin.id, auctionId: parsed.data.auctionId, now: new Date() }, pushLater);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure("annulation admin", e);
  }
}

// --- Lectures ---

export type MarketPageResult = { ok: true; items: AuctionListItem[]; nextCursor: string | null } | Failure;

const pageSchema = z
  .object({ params: z.record(z.string().max(20), z.string().max(80)), cursor: z.string().max(120) })
  .strict();

/** Pages suivantes du marché (la première est rendue par le serveur). Consultation ouverte aux invités. */
export async function loadMarketPageAction(input: unknown): Promise<MarketPageResult> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const cursor = decodeMarketCursor(parsed.data.cursor);
  if (!cursor) return { ok: false, error: "INVALID" };
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`market-page:${user.id}`, { limit: 60, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const page = await listAuctions({
    params: parseMarketParams(parsed.data.params, await getRarities()),
    cursor,
    viewerId: user.id,
    locale: await getLocale(),
    now: new Date(),
  });
  return { ok: true, ...page };
}

export type LiveResult = { ok: true; live: AuctionLive } | Failure;

/** Prix, prochaine mise et fin d'une vente ouverte, sondés par la fiche toutes les market.pollSeconds. */
export async function auctionLiveAction(input: unknown): Promise<LiveResult> {
  const parsed = auctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`market-live:${user.id}`, { limit: 60, windowSeconds: MINUTE })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const live = await auctionLive(parsed.data.auctionId, user.id, new Date());
  return live ? { ok: true, live } : { ok: false, error: "NOT_FOUND" };
}
