// Cadeaux entre amis, atomiques. Le client Prisma est injecté (serveur ou test de concurrence).
// Les deux joueurs sont verrouillés : quotas du jour, propriété de la carte et solde sont relus
// sous verrou, puis la carte change de propriétaire (ou les Zeni sont débités) dans la même
// transaction que la ligne Gift et la notification.
import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, filterContext } from "@/lib/boosters/pool-filter";
import type { Rarity } from "@/lib/catalog/rarity";
import {
  checkGift,
  checkSealedGift,
  pickGiftCopy,
  type GiftRefusal,
  type GiftRules,
  type SealedGiftRefusal,
  type SealedGiftRules,
} from "@/lib/social/gifts";
import { SEALED_KINDS } from "@/lib/boosters/draw";
import { pairKey } from "@/lib/social/relation";
import { grantBoosters } from "../economy/credits";
import { debit, LedgerError } from "../economy/ledger";
import { blocksBetween, lockPlayers, type LockedPlayer, type Tx } from "./lock";
import { notify, notifyingTransaction, type OnNotified } from "./notify";
import { consumeWishlist } from "../collection/wishlist-core";

export type GiftErrorCode = GiftRefusal | SealedGiftRefusal | "NO_USER" | "NOT_OWNED" | "RARITY" | "NOT_ENOUGH_ZENI";

export class GiftError extends Error {
  constructor(readonly code: GiftErrorCode) {
    super(code);
  }
}

export type GiftContext = {
  senderId: string;
  recipientId: string;
  rules: GiftRules;
  timeZone: string;
};

const TX = { maxWait: 10_000, timeout: 15_000 };

/** Jour du jeu (fuseau game.timeZone) : les quotas repartent à minuit, heure du jeu. */
export function giftDay(now: Date, timeZone: string): string {
  return dayKey(filterContext(now, timeZone));
}

async function checkUnderLock(tx: Tx, ctx: GiftContext, now: Date): Promise<{ sender: LockedPlayer; day: string }> {
  if (ctx.senderId === ctx.recipientId) throw new GiftError("NOT_FRIENDS");
  const players = await lockPlayers(tx, [ctx.senderId, ctx.recipientId]);
  const sender = players.get(ctx.senderId);
  const recipient = players.get(ctx.recipientId);
  if (!sender) throw new GiftError("NO_USER");
  if (!recipient) throw new GiftError("NOT_FRIENDS");

  const day = giftDay(now, ctx.timeZone);
  const [friendship, blocks, sentToday, receivedToday] = await Promise.all([
    tx.friendship.findUnique({
      where: { pairKey: pairKey(ctx.senderId, ctx.recipientId) },
      select: { status: true, acceptedAt: true, createdAt: true },
    }),
    blocksBetween(tx, ctx.senderId, ctx.recipientId),
    // Envois du jour à cet ami (la limite compte par ami, plus en tout) ; réceptions du jour, tous amis confondus
    tx.gift.count({ where: { senderId: ctx.senderId, recipientId: ctx.recipientId, dayKey: day } }),
    tx.gift.count({ where: { recipientId: ctx.recipientId, dayKey: day } }),
  ]);
  const friendsSince = friendship?.status === "ACCEPTED" ? (friendship.acceptedAt ?? friendship.createdAt) : null;

  const refusal = checkGift({
    sender,
    recipient,
    friendsSince,
    blocked: blocks.byMe || blocks.byThem,
    sentToday,
    receivedToday,
    now,
    rules: ctx.rules,
  });
  if (refusal) throw new GiftError(refusal);
  return { sender, day };
}

/**
 * Offre un exemplaire de `cardId` (id de Card) : le serveur choisit l'exemplaire, le plus récent
 * hors vitrine. L'exemplaire garde son id : l'historique (tirage, cadeau) reste lisible.
 */
export async function giftCardWith(
  db: PrismaClient,
  ctx: GiftContext & { cardId: string; allowedRarities: readonly Rarity[] },
  onNotified?: OnNotified,
): Promise<{ giftId: string; userCardId: string }> {
  return notifyingTransaction(db, async (tx) => {
    const now = new Date();
    const { day } = await checkUnderLock(tx, ctx, now);

    const copies = await tx.userCard.findMany({
      where: { ownerId: ctx.senderId, cardId: ctx.cardId, status: "COLLECTION" },
      select: { id: true, obtainedAt: true, card: { select: { rarity: true } } },
    });
    if (copies.length === 0) throw new GiftError("NOT_OWNED");
    if (!ctx.allowedRarities.includes(copies[0].card.rarity as Rarity)) throw new GiftError("RARITY");

    const shown = await tx.showcaseSlot.findMany({
      where: { userId: ctx.senderId, userCardId: { in: copies.map((c) => c.id) } },
      select: { userCardId: true },
    });
    const copy = pickGiftCopy(copies, new Set(shown.map((s) => s.userCardId)))!;

    // Transfert conditionnel : un exemplaire vendu ou recyclé entre-temps n'est jamais offert
    const moved = await tx.userCard.updateMany({
      where: { id: copy.id, ownerId: ctx.senderId, status: "COLLECTION" },
      data: { ownerId: ctx.recipientId, obtainedAt: now },
    });
    if (moved.count !== 1) throw new GiftError("NOT_OWNED");
    await tx.showcaseSlot.deleteMany({ where: { userCardId: copy.id } });
    await tx.discovery.createMany({
      data: [{ userId: ctx.recipientId, cardId: ctx.cardId, createdAt: now }],
      skipDuplicates: true,
    });
    await consumeWishlist(tx, ctx.recipientId, [ctx.cardId]);

    const gift = await tx.gift.create({
      data: {
        senderId: ctx.senderId,
        recipientId: ctx.recipientId,
        kind: "CARD",
        cardId: ctx.cardId,
        userCardId: copy.id,
        dayKey: day,
        createdAt: now,
      },
      select: { id: true },
    });
    await notify(tx, {
      userId: ctx.recipientId,
      type: "GIFT_RECEIVED",
      actorId: ctx.senderId,
      refId: gift.id,
      payload: { kind: "CARD", cardId: ctx.cardId },
      now,
    });
    return { giftId: gift.id, userCardId: copy.id };
  }, TX, onNotified);
}

/** Type des boosters offerts entre amis. */
export const GIFT_BOOSTER_SLUG = "standard";

/**
 * Offre un booster standard payé en Zeni par l'expéditeur : le stock gratuit ne se transfère
 * jamais (un compte secondaire n'a rien à donner que ses Zeni). Le destinataire le reçoit en
 * crédit (BoosterCredit) et l'ouvre sans booster doré ni divin.
 */
export async function giftBoosterWith(
  db: PrismaClient,
  ctx: GiftContext & { price: number },
  onNotified?: OnNotified,
): Promise<{ giftId: string; coins: number }> {
  if (!Number.isInteger(ctx.price) || ctx.price < 1) throw new GiftError("DISABLED");
  return notifyingTransaction(db, async (tx) => {
    const now = new Date();
    const { sender, day } = await checkUnderLock(tx, ctx, now);
    if (sender.coins < ctx.price) throw new GiftError("NOT_ENOUGH_ZENI");
    const standard = await tx.boosterType.findUnique({ where: { slug: GIFT_BOOSTER_SLUG }, select: { id: true } });
    if (!standard) throw new GiftError("DISABLED");

    const gift = await tx.gift.create({
      data: {
        senderId: ctx.senderId,
        recipientId: ctx.recipientId,
        kind: "BOOSTER",
        zeniSpent: ctx.price,
        dayKey: day,
        createdAt: now,
      },
      select: { id: true },
    });
    let coins: number;
    try {
      coins = await debit(tx, { userId: ctx.senderId, amount: ctx.price, reason: "GIFT", refId: gift.id, now });
    } catch (e) {
      if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new GiftError("NOT_ENOUGH_ZENI");
      throw e;
    }
    await grantBoosters(tx, ctx.recipientId, standard.id, 1);
    await notify(tx, {
      userId: ctx.recipientId,
      type: "GIFT_RECEIVED",
      actorId: ctx.senderId,
      refId: gift.id,
      payload: { kind: "BOOSTER" },
      now,
    });
    return { giftId: gift.id, coins };
  }, TX, onNotified);
}

const WEEK = 7 * 24 * 3_600_000;

/**
 * Offre un sachet scellé (Divin, Apocalyptique) tombé d'un tirage : une seule fois, depuis un compte
 * lié à Discord et assez ancien, dans la limite de la semaine. Le sachet change de propriétaire par
 * un UPDATE conditionnel (une ouverture simultanée l'emporte ou échoue, jamais les deux) et ne
 * pourra plus être offert ; celui qui l'a offert recevra le résultat à l'ouverture.
 */
export async function giftSealedWith(
  db: PrismaClient,
  ctx: GiftContext & { dropId: string; sealedRules: SealedGiftRules },
  onNotified?: OnNotified,
): Promise<{ giftId: string }> {
  return notifyingTransaction(db, async (tx) => {
    const now = new Date();
    const { sender, day } = await checkUnderLock(tx, ctx, now);

    const drop = await tx.sealedDrop.findFirst({
      where: { id: ctx.dropId, ownerId: ctx.senderId, openedAt: null },
      select: { giftable: true, boosterType: { select: { slug: true } } },
    });
    const kind = SEALED_KINDS.find((k) => k === drop?.boosterType.slug);
    if (!drop || !kind) throw new GiftError("NOT_OWNED");
    const [discord, sentThisWeek] = await Promise.all([
      tx.account.count({ where: { userId: ctx.senderId, provider: "discord" } }),
      tx.gift.count({ where: { senderId: ctx.senderId, kind: "SEALED", createdAt: { gt: new Date(now.getTime() - WEEK) } } }),
    ]);
    const refusal = checkSealedGift({
      giftable: drop.giftable,
      hasDiscord: discord > 0,
      senderCreatedAt: sender.createdAt,
      sentThisWeek,
      now,
      rules: ctx.sealedRules,
    });
    if (refusal) throw new GiftError(refusal);

    const moved = await tx.sealedDrop.updateMany({
      where: { id: ctx.dropId, ownerId: ctx.senderId, openedAt: null, giftable: true },
      data: { ownerId: ctx.recipientId, giverId: ctx.senderId, source: "GIFT", giftable: false },
    });
    if (moved.count !== 1) throw new GiftError("NOT_OWNED");

    const gift = await tx.gift.create({
      data: {
        senderId: ctx.senderId,
        recipientId: ctx.recipientId,
        kind: "SEALED",
        sealedDropId: ctx.dropId,
        dayKey: day,
        createdAt: now,
      },
      select: { id: true },
    });
    await notify(tx, {
      userId: ctx.recipientId,
      type: "GIFT_RECEIVED",
      actorId: ctx.senderId,
      refId: gift.id,
      payload: { kind: "SEALED", slug: kind, dropId: ctx.dropId },
      now,
    });
    return { giftId: gift.id };
  }, TX, onNotified);
}
