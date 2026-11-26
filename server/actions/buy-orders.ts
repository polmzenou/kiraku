"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { isFrozen } from "@/lib/account/deletion";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { alertOwnersWith, BuyOrderError, cancelOrderWith, createOrderWith, fillOrderWith } from "../market/buy-order-core";
import { getBuyOrderRules } from "../market/buy-order-queries";
import { getMarketRules, pushLater } from "../market/queries";
import { getMarketQuotes } from "../market/quotes";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Avis de recherche. Ordre des contrôles : Zod → session → compte autorisé → interrupteurs → rate limit,
// puis tout est relu sous verrou dans la transaction (server/market/buy-order-core.ts). Le client
// n'envoie que des ids, le prix qu'il propose et le prix qu'il a vu : séquestre, propriété de
// l'exemplaire et taxe sont décidés ici.

export type BuyOrderActionError =
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "DISABLED"
  | "GUEST"
  | "TOO_NEW"
  | "INVALID_PRICE"
  | "CAP_REACHED"
  | "NO_CARD"
  | "TOO_MANY_OPEN"
  | "NOT_ENOUGH_ZENI"
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_ORDER"
  | "STALE"
  | "NOT_OWNED"
  | "SPECIAL_ONLY"
  | "REFEREE_LOCKED"
  | "PAIR_LOCKED";

type Failure = { ok: false; error: BuyOrderActionError };

const MINUTE = 60;
const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const zeni = z.number().int().min(1).max(100_000_000);

type Player = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function session(bucket: string, rule: { limit: number; windowSeconds: number }): Promise<{ user: Player } | { error: BuyOrderActionError }> {
  const user = await getCurrentUser();
  if (!user) return { error: "NO_SESSION" };
  if (user.bannedAt || isFrozen(user)) return { error: "UNAVAILABLE" };
  // Invités en consultation seule ; la transaction le revérifie
  if (user.isGuest) return { error: "GUEST" };
  const [market, orders] = await Promise.all([getMarketRules(), getBuyOrderRules()]);
  if (!market.enabled || !orders.enabled) return { error: "DISABLED" };
  if (!(await rateLimit(`${bucket}:${user.id}`, rule)).success) return { error: "RATE_LIMITED" };
  return { user };
}

function failure(scope: string, e: unknown): Failure {
  if (e instanceof BuyOrderError) {
    // Ces refus ne concernent jamais le joueur lui-même : message générique
    if (e.code === "NO_USER" || e.code === "BANNED" || e.code === "UNAVAILABLE" || e.code === "ORDERS_CLOSED") return { ok: false, error: "UNAVAILABLE" };
    return { ok: false, error: e.code };
  }
  console.error(`[avis] ${scope}`, e);
  return { ok: false, error: "UNAVAILABLE" };
}

// --- Publication ---

export type CreateBuyOrderResult = { ok: true; orderId: string; coins: number } | Failure;

const createSchema = z.object({ cardId: idSchema, price: zeni }).strict();

export async function createBuyOrderAction(input: unknown): Promise<CreateBuyOrderResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("order-create", { limit: 10, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    // Propriété : l'acheteur est toujours le joueur de la session ; prix bloqué sur son solde
    const now = new Date();
    const [rules, orderRules] = await Promise.all([getMarketRules(), getBuyOrderRules()]);
    const order = await createOrderWith(prisma, {
      buyerId: g.user.id,
      cardId: parsed.data.cardId,
      price: parsed.data.price,
      now,
      rules,
      durationDays: orderRules.durationDays,
      maxOpen: orderRules.maxOpen,
    });
    // Alerte aux détenteurs après la réponse : elle ne ralentit ni ne fait échouer la publication. L'avis y est relu
    // (annulé aussitôt, il n'alerte personne) ; plafond par acheteur et référence de la rareté réglés dans l'admin
    after(async () => {
      try {
        const [quotes, perDay, rarityRef] = await Promise.all([getMarketQuotes(), getSetting("market.orderAlertsPerDay"), getSetting("market.orderAlertRarityRef")]);
        const quote = quotes.byCard[order.cardId]?.price ?? null;
        await alertOwnersWith(prisma, { orderId: order.orderId, buyerId: g.user.id, cardId: order.cardId, price: order.price }, quote, new Date(), pushLater, {
          perDay,
          ...(rarityRef && { rarity: { reference: quotes.byRarity[order.rarity] ?? null } }),
        });
      } catch (e) {
        console.warn("[avis] alerte aux détenteurs", e);
      }
    });
    refresh();
    return { ok: true, orderId: order.orderId, coins: order.coins };
  } catch (e) {
    return failure("publication", e);
  }
}

// --- Annulation ---

export type CancelBuyOrderResult = { ok: true; cancelled: boolean } | Failure;

const cancelSchema = z.object({ orderId: idSchema }).strict();

export async function cancelBuyOrderAction(input: unknown): Promise<CancelBuyOrderResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  // Annuler reste possible marché fermé : c'est ainsi qu'on récupère ses Zeni
  if (!(await rateLimit(`order-cancel:${user.id}`, { limit: 20, windowSeconds: MINUTE })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    // Propriété : cancelOrderWith refuse l'avis d'un autre joueur (NOT_FOUND)
    const res = await cancelOrderWith(prisma, { buyerId: user.id, orderId: parsed.data.orderId, now: new Date() });
    refresh();
    return { ok: true, cancelled: res.cancelled };
  } catch (e) {
    return failure("annulation", e);
  }
}

// --- Vente en un clic ---

export type FillBuyOrderResult = { ok: true; net: number; coins: number } | Failure;

const fillSchema = z.object({ orderId: idSchema, expectedPrice: zeni }).strict();

export async function fillBuyOrderAction(input: unknown): Promise<FillBuyOrderResult> {
  const parsed = fillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const g = await session("order-fill", { limit: 20, windowSeconds: MINUTE });
  if ("error" in g) return { ok: false, error: g.error };
  try {
    // Propriété : l'exemplaire vendu est choisi en base parmi ceux du joueur de la session
    const res = await fillOrderWith(
      prisma,
      { sellerId: g.user.id, orderId: parsed.data.orderId, expectedPrice: parsed.data.expectedPrice, now: new Date(), rules: await getMarketRules() },
      pushLater,
    );
    // Pas de refresh() ici : la tuile qui affiche « Vendu » serait démontée ; le client recharge après l'avoir montrée
    return { ok: true, net: res.net, coins: res.coins };
  } catch (e) {
    return failure("vente", e);
  }
}
