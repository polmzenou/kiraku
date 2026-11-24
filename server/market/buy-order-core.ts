// Avis de recherche (ordres d'achat), atomiques. Le client Prisma est injecté (serveur ou test de
// concurrence) : pas de server/db.ts ici. Le client n'envoie que des ids, le prix qu'il propose et le
// prix qu'il a vu ; tout le reste vient de la base.
//
// Séquestre : le prix est débité de l'acheteur à la publication (ORDER_HOLD) et lui revient à
// l'annulation ou à l'expiration (ORDER_REFUND). À la vente, le vendeur reçoit SALE + prix puis
// FEE − taxe, comme aux enchères. Invariant : Σ soldes + Σ séquestres (enchères ACTIVE et avis OPEN)
// + Σ taxes ne bouge pas (buy-orders.db.test.ts).
//
// Ordre des verrous, le même que l'hôtel des ventes : l'avis (FOR UPDATE ou updateMany conditionnel)
// puis les joueurs, triés par id (lockPlayers).
import type { PrismaClient } from "@/generated/prisma/client";
import { isFrozen } from "@/lib/account/deletion";
import { checkOrder, orderExpiresAt, orderOpen, shouldAlert, type OrderRefusal } from "@/lib/market/buy-orders";
import { checkTrader, saleFee, type MarketRules, type TraderRefusal } from "@/lib/market/rules";
import { ORDINARY_COPY } from "@/lib/collection/copies";
import type { LockRefusal } from "@/lib/referral/locks";
import { applyEntries, credit, debit, LedgerError } from "../economy/ledger";
import { checkReferralLocks } from "../referral/locks";
import { lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { recordDiscoveries } from "../collection/discovery";
import { chooseCopy, moveCopy } from "../collection/transfer";
import { consumeWishlist } from "../collection/wishlist-core";

export type BuyOrderErrorCode =
  | TraderRefusal
  | OrderRefusal
  | "NO_USER"
  | "NO_CARD"
  | "ORDERS_CLOSED"
  | "TOO_MANY_OPEN"
  | "NOT_ENOUGH_ZENI"
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_ORDER"
  | "STALE"
  | "UNAVAILABLE"
  | "NOT_OWNED"
  // Prestige : le vendeur n'a de cette carte que des pièces spéciales (héritières, gravées), jamais prises par un avis
  | "SPECIAL_ONLY"
  | LockRefusal;

export class BuyOrderError extends Error {
  constructor(readonly code: BuyOrderErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };
const DAY = 86_400_000;
/** Garde-fou technique : un avis ne prévient pas plus de détenteurs que ça (une transaction courte). */
const MAX_ALERTS = 200;

/** Ligne d'avis lue sous verrou. */
type LockedOrder = {
  id: string;
  buyerId: string;
  cardId: string;
  price: number;
  feeBp: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "EXPIRED";
  expiresAt: Date;
};

async function lockOrder(tx: Tx, orderId: string): Promise<LockedOrder | null> {
  const [row] = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, "buyerId", "cardId", price, "feeBp", status::text AS status, "expiresAt"
    FROM "BuyOrder" WHERE id = ${orderId} FOR UPDATE`;
  return row ?? null;
}

// --- Publication ---

export type CreateOrderInput = {
  buyerId: string;
  cardId: string;
  price: number;
  now: Date;
  rules: MarketRules;
  durationDays: number;
  maxOpen: number;
};

export type CreatedOrder = { orderId: string; cardId: string; price: number; expiresAt: Date; coins: number };

/** Publie un avis : le prix est bloqué tout de suite, refusé au-delà du plafond de la rareté. */
export async function createOrderWith(db: PrismaClient, input: CreateOrderInput): Promise<CreatedOrder> {
  const card = await db.card.findUnique({ where: { id: input.cardId }, select: { rarity: true, status: true } });
  if (!card || card.status === "DRAFT") throw new BuyOrderError("NO_CARD");
  const refusal = checkOrder(input.price, input.rules, card.rarity);
  if (refusal) throw new BuyOrderError(refusal);

  return db.$transaction(async (tx) => {
    const buyer = (await lockPlayers(tx, [input.buyerId])).get(input.buyerId);
    if (!buyer) throw new BuyOrderError("NO_USER");
    const notAllowed = checkTrader(buyer, input.now, input.rules);
    if (notAllowed) throw new BuyOrderError(notAllowed);

    // Compté sous le verrou de l'acheteur : deux publications simultanées ne dépassent pas la limite
    const open = await tx.buyOrder.count({ where: { buyerId: input.buyerId, status: "OPEN", expiresAt: { gt: input.now } } });
    if (open >= input.maxOpen) throw new BuyOrderError("TOO_MANY_OPEN");

    const expiresAt = orderExpiresAt(input.now, input.durationDays);
    const order = await tx.buyOrder.create({
      data: { buyerId: input.buyerId, cardId: input.cardId, price: input.price, feeBp: input.rules.feeBp, expiresAt, createdAt: input.now },
      select: { id: true },
    });
    let coins: number;
    try {
      coins = await debit(tx, { userId: input.buyerId, amount: input.price, reason: "ORDER_HOLD", refId: order.id, now: input.now });
    } catch (e) {
      if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new BuyOrderError("NOT_ENOUGH_ZENI");
      throw e;
    }
    return { orderId: order.id, cardId: input.cardId, price: input.price, expiresAt, coins };
  }, TX);
}

// --- Annulation et expiration ---

/** Ferme un avis ouvert (annulé ou expiré) et rend son séquestre. False si un autre passage l'a déjà fermé. */
async function closeOrder(tx: Tx, order: Pick<LockedOrder, "id" | "buyerId" | "cardId" | "price">, status: "CANCELLED" | "EXPIRED", now: Date) {
  const closed = await tx.buyOrder.updateMany({
    where: { id: order.id, buyerId: order.buyerId, status: "OPEN", ...(status === "EXPIRED" && { expiresAt: { lte: now } }) },
    data: { status, closedAt: now },
  });
  if (closed.count !== 1) return false;
  await lockPlayers(tx, [order.buyerId]);
  await credit(tx, { userId: order.buyerId, amount: order.price, reason: "ORDER_REFUND", refId: order.id, now });
  return true;
}

/** Annulation par l'acheteur, à tout moment tant que l'avis est ouvert. Idempotent. */
export async function cancelOrderWith(db: PrismaClient, input: { buyerId: string; orderId: string; now: Date }): Promise<{ cancelled: boolean }> {
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order || order.buyerId !== input.buyerId) throw new BuyOrderError("NOT_FOUND");
    if (order.status !== "OPEN") return { cancelled: false };
    return { cancelled: await closeOrder(tx, order, "CANCELLED", input.now) };
  }, TX);
}

/** Expire un avis échu, rend ses Zeni et prévient l'acheteur. */
export async function expireOrderWith(db: PrismaClient, orderId: string, now: Date, onNotified?: OnNotified): Promise<boolean> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!order || order.status !== "OPEN" || order.expiresAt > now) return false;
      if (!(await closeOrder(tx, order, "EXPIRED", now))) return false;
      await notify(tx, {
        userId: order.buyerId,
        type: "BUY_ORDER_EXPIRED",
        actorId: order.buyerId,
        refId: order.id,
        payload: { orderId: order.id, cardId: order.cardId, amount: order.price },
        now,
      });
      return true;
    },
    TX,
    onNotified,
  );
}

/**
 * Expire les avis échus, les plus anciens d'abord : balayage du cron, ou ceux d'un seul acheteur
 * (`buyerId`) quand il ouvre ses avis, pour qu'il retrouve ses Zeni sans attendre le cron quotidien.
 * Un échec n'arrête pas le balayage.
 */
export async function expireDueWith(
  db: PrismaClient,
  now: Date,
  limit = 100,
  onNotified?: OnNotified,
  buyerId?: string,
): Promise<{ expired: number; failed: number }> {
  const due = await db.buyOrder.findMany({
    where: { status: "OPEN", expiresAt: { lte: now }, ...(buyerId && { buyerId }) },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  let expired = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      if (await expireOrderWith(db, id, now, onNotified)) expired++;
    } catch (e) {
      failed++;
      console.error(`[marche] expiration de l'avis ${id}`, e);
    }
  }
  return { expired, failed };
}

// --- Vente en un clic ---

export type FillOrderInput = { sellerId: string; orderId: string; expectedPrice: number; now: Date; rules: MarketRules };
export type FilledOrder = { orderId: string; cardId: string; price: number; net: number; coins: number };

/**
 * Vend un exemplaire de la carte cherchée à l'acheteur, au prix de l'avis (`expectedPrice` = prix vu ;
 * STALE s'il a changé). L'exemplaire est un ordinaire, le plus récent hors vitrine, sinon le plus récent exposé :
 * une pièce spéciale (héritière, gravée) ne part jamais par un avis.
 */
export async function fillOrderWith(db: PrismaClient, input: FillOrderInput, onNotified?: OnNotified): Promise<FilledOrder> {
  const { now } = input;
  return notifyingTransaction(
    db,
    async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      if (!order) throw new BuyOrderError("NOT_FOUND");
      if (!orderOpen(order, now)) throw new BuyOrderError("CLOSED");
      if (order.buyerId === input.sellerId) throw new BuyOrderError("OWN_ORDER");
      if (order.price !== input.expectedPrice) throw new BuyOrderError("STALE");

      const players = await lockPlayers(tx, [input.sellerId, order.buyerId]);
      const seller = players.get(input.sellerId);
      if (!seller) throw new BuyOrderError("NO_USER");
      const notAllowed = checkTrader(seller, now, input.rules);
      if (notAllowed) throw new BuyOrderError(notAllowed);
      // Acheteur banni ou en cours de suppression : l'avis reste ouvert (remboursé à l'expiration ou par l'admin)
      const buyer = players.get(order.buyerId);
      const buyerState = buyer ? await tx.user.findUnique({ where: { id: buyer.id }, select: { deletionRequestedAt: true, anonymizedAt: true } }) : null;
      if (!buyer || buyer.bannedAt || !buyerState || isFrozen(buyerState)) throw new BuyOrderError("UNAVAILABLE");
      const locked = await checkReferralLocks(tx, { actorId: input.sellerId, counterpartyId: order.buyerId, ownItems: true, mutual: true, now });
      if (locked) throw new BuyOrderError(locked);

      const choice = await chooseCopy(tx, input.sellerId, order.cardId);
      if (!choice.ok) throw new BuyOrderError(choice.reason === "CHOOSE_COPY" ? "SPECIAL_ONLY" : "NOT_OWNED");

      // Transfert conditionnel (moveCopy) : un exemplaire offert, recyclé ou mis en vente entre-temps ne part jamais.
      // Toujours un ordinaire ici : aucune provenance n'est écrite, `via` ne sert pas.
      const moved = await moveCopy(tx, { userCardId: choice.id, fromId: input.sellerId, fromStatus: "COLLECTION", toId: order.buyerId, via: "AUCTION", now });
      if (!moved) throw new BuyOrderError("NOT_OWNED");
      await tx.showcaseItem.deleteMany({ where: { userCardId: choice.id } });
      await recordDiscoveries(tx, [{ userId: order.buyerId, cardId: order.cardId }], now);
      await consumeWishlist(tx, order.buyerId, [order.cardId]);

      const fee = saleFee(order.price, order.feeBp);
      await tx.buyOrder.update({
        where: { id: order.id },
        data: { status: "FILLED", sellerId: input.sellerId, userCardId: choice.id, filledAt: now, fee },
      });
      const coins = await applyEntries(
        tx,
        input.sellerId,
        [
          { amount: order.price, reason: "SALE", refId: order.id },
          ...(fee > 0 ? [{ amount: -fee, reason: "FEE" as const, refId: order.id }] : []),
        ],
        now,
      );
      await notify(tx, {
        userId: order.buyerId,
        type: "BUY_ORDER_FILLED",
        actorId: input.sellerId,
        refId: order.id,
        payload: { orderId: order.id, cardId: order.cardId, amount: order.price },
        now,
      });
      return { orderId: order.id, cardId: order.cardId, price: order.price, net: order.price - fee, coins };
    },
    TX,
    onNotified,
  );
}

// --- Alerte aux détenteurs ---

/**
 * Prévient les joueurs qui ont un exemplaire libre de la carte qu'un avis la cherche, si l'offre
 * dépasse la cote (ou s'il n'y en a pas). Au plus une alerte par joueur et par carte sur 24 h.
 * Transaction séparée, après la publication : une alerte ratée ne fait pas échouer l'avis.
 */
export async function alertOwnersWith(
  db: PrismaClient,
  order: { orderId: string; buyerId: string; cardId: string; price: number },
  quotePrice: number | null,
  now: Date,
  onNotified?: OnNotified,
): Promise<number> {
  if (!shouldAlert(order.price, quotePrice)) return 0;
  return notifyingTransaction(
    db,
    async (tx) => {
      const holders = await tx.userCard.findMany({
        where: { cardId: order.cardId, status: "COLLECTION", ...ORDINARY_COPY, ownerId: { not: order.buyerId }, owner: { bannedAt: null, isGuest: false } },
        distinct: ["ownerId"],
        select: { ownerId: true },
        take: MAX_ALERTS,
      });
      if (holders.length === 0) return 0;
      const recent = await tx.notification.findMany({
        where: { type: "BUY_ORDER_WANTED", refId: order.cardId, userId: { in: holders.map((h) => h.ownerId) }, createdAt: { gt: new Date(now.getTime() - DAY) } },
        select: { userId: true },
      });
      const already = new Set(recent.map((r) => r.userId));
      const targets = holders.map((h) => h.ownerId).filter((id) => !already.has(id));
      for (const userId of targets) {
        await notify(tx, {
          userId,
          type: "BUY_ORDER_WANTED",
          actorId: order.buyerId,
          refId: order.cardId,
          payload: { orderId: order.orderId, cardId: order.cardId, amount: order.price },
          now,
        });
      }
      return targets.length;
    },
    TX,
    onNotified,
  );
}
