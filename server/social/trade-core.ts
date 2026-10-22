// Échanges entre amis, atomiques. Le client Prisma est injecté (serveur ou test de concurrence).
//
// Proposer ne bloque rien : l'ami reçoit « ta carte X contre l'une de celles-ci ». À l'acceptation,
// la proposition puis les deux joueurs sont verrouillés (même ordre que l'hôtel des ventes : la
// ligne d'objet, puis les joueurs triés par id), l'amitié, les blocages et la présence d'un
// exemplaire libre de chaque côté sont relus, puis les deux exemplaires changent de propriétaire par
// des updateMany conditionnels. Si une carte n'est plus là, la proposition passe en FAILED.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Rarity } from "@/lib/catalog/rarity";
import { pairKey } from "@/lib/social/relation";
import { checkProposal, isTradeOpen, tradeExpiresAt, uniqueOffered, type TradeRefusal, type TradeRules } from "@/lib/social/trades";
import { freeCopy } from "./free-copy";
import { blocksBetween, lockPlayers, type Tx } from "./lock";
import { notify, notifyingTransaction, type OnNotified } from "./notify";
import { consumeWishlist } from "../collection/wishlist-core";

export type TradeErrorCode =
  | TradeRefusal
  | "NO_USER"
  | "WANTED_GONE"
  | "OFFER_GONE"
  | "NOT_FOUND"
  | "CLOSED"
  | "NOT_OFFERED"
  | "CARD_GONE";

export class TradeError extends Error {
  constructor(readonly code: TradeErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 15_000 };
const DAY_MS = 24 * 3_600_000;

async function friendsAndBlocks(tx: Tx, a: string, b: string) {
  const [friendship, blocks] = await Promise.all([
    tx.friendship.findUnique({ where: { pairKey: pairKey(a, b) }, select: { status: true } }),
    blocksBetween(tx, a, b),
  ]);
  return { friends: friendship?.status === "ACCEPTED", blocked: blocks.byMe || blocks.byThem };
}

export type ProposeInput = {
  proposerId: string;
  recipientId: string;
  wantedCardId: string;
  offeredCardIds: readonly string[];
  /** Mot du proposant, déjà nettoyé (texte brut). */
  note?: string | null;
  rules: TradeRules;
  now?: Date;
};

/** « Je veux ta carte X contre l'une de celles-ci » : vérifie tout sous verrou, puis notifie l'ami. */
export async function proposeTradeWith(db: PrismaClient, input: ProposeInput, onNotified?: OnNotified): Promise<{ tradeId: string }> {
  const now = input.now ?? new Date();
  if (input.proposerId === input.recipientId) throw new TradeError("NOT_FRIENDS");
  const offeredIds = uniqueOffered(input.offeredCardIds);

  return notifyingTransaction(
    db,
    async (tx) => {
      const players = await lockPlayers(tx, [input.proposerId, input.recipientId]);
      const proposer = players.get(input.proposerId);
      const recipient = players.get(input.recipientId);
      if (!proposer || proposer.bannedAt) throw new TradeError("NO_USER");
      if (!recipient || recipient.isGuest || recipient.bannedAt) throw new TradeError("NOT_FRIENDS");

      const [relation, cards, wantedCopies, offeredOwned, pendingSent, sentLastDay, duplicate] = await Promise.all([
        friendsAndBlocks(tx, input.proposerId, input.recipientId),
        tx.card.findMany({ where: { id: { in: [input.wantedCardId, ...offeredIds] } }, select: { id: true, rarity: true } }),
        tx.userCard.count({ where: { ownerId: input.recipientId, cardId: input.wantedCardId, status: "COLLECTION" } }),
        tx.userCard.groupBy({
          by: ["cardId"],
          where: { ownerId: input.proposerId, cardId: { in: offeredIds }, status: "COLLECTION" },
        }),
        tx.trade.count({ where: { proposerId: input.proposerId, status: "PENDING", expiresAt: { gt: now } } }),
        tx.trade.count({ where: { proposerId: input.proposerId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } }),
        tx.trade.count({
          where: {
            proposerId: input.proposerId,
            recipientId: input.recipientId,
            wantedCardId: input.wantedCardId,
            status: "PENDING",
            expiresAt: { gt: now },
          },
        }),
      ]);
      const rarity = new Map(cards.map((c) => [c.id, c.rarity as Rarity]));
      const wantedRarity = rarity.get(input.wantedCardId);
      if (!wantedRarity) throw new TradeError("WANTED_GONE");
      if (offeredIds.some((id) => !rarity.has(id))) throw new TradeError("OFFER_GONE");

      const refusal = checkProposal({
        wanted: { cardId: input.wantedCardId, rarity: wantedRarity },
        offered: offeredIds.map((id) => ({ cardId: id, rarity: rarity.get(id)! })),
        friends: relation.friends,
        blocked: relation.blocked,
        pendingSent,
        sentLastDay,
        duplicate: duplicate > 0,
        rules: input.rules,
      });
      if (refusal) throw new TradeError(refusal);
      if (wantedCopies === 0) throw new TradeError("WANTED_GONE");
      if (offeredOwned.length !== offeredIds.length) throw new TradeError("OFFER_GONE");

      const trade = await tx.trade.create({
        data: {
          proposerId: input.proposerId,
          recipientId: input.recipientId,
          wantedCardId: input.wantedCardId,
          expiresAt: tradeExpiresAt(now, input.rules.expiryHours),
          createdAt: now,
          note: input.note ?? null,
          offers: { create: offeredIds.map((cardId) => ({ cardId })) },
        },
        select: { id: true },
      });
      await notify(tx, {
        userId: input.recipientId,
        type: "TRADE_PROPOSED",
        actorId: input.proposerId,
        refId: trade.id,
        payload: { tradeId: trade.id, cardId: input.wantedCardId },
        now,
      });
      return { tradeId: trade.id };
    },
    TX,
    onNotified,
  );
}

type LockedTrade = {
  id: string;
  proposerId: string;
  recipientId: string;
  wantedCardId: string;
  status: string;
  expiresAt: Date;
};

async function lockTrade(tx: Tx, tradeId: string): Promise<LockedTrade | null> {
  const [row] = await tx.$queryRaw<LockedTrade[]>`
    SELECT id, "proposerId", "recipientId", "wantedCardId", status::text AS status, "expiresAt"
    FROM "Trade" WHERE id = ${tradeId} FOR UPDATE`;
  return row ?? null;
}

export type AcceptOutcome =
  | { ok: true; received: { cardId: string; userCardId: string; isNew: boolean; wished: boolean } }
  | { ok: false; code: "CARD_GONE" | "CLOSED" };

/**
 * L'ami accepte en choisissant une des cartes offertes. Une proposition expirée passe en EXPIRED,
 * une carte manquante d'un côté la passe en FAILED : ces changements d'état sont validés, l'échange
 * n'a simplement pas lieu (résultat ok: false).
 */
export async function acceptTradeWith(
  db: PrismaClient,
  input: { userId: string; tradeId: string; chosenCardId: string; allowedRarities: readonly Rarity[]; now?: Date },
  onNotified?: OnNotified,
): Promise<AcceptOutcome> {
  const now = input.now ?? new Date();
  return notifyingTransaction(
    db,
    async (tx): Promise<AcceptOutcome> => {
      const trade = await lockTrade(tx, input.tradeId);
      if (!trade || trade.recipientId !== input.userId) throw new TradeError("NOT_FOUND");
      if (trade.status !== "PENDING") throw new TradeError("CLOSED");
      if (!isTradeOpen(trade, now)) {
        await tx.trade.update({ where: { id: trade.id }, data: { status: "EXPIRED", resolvedAt: now } });
        return { ok: false, code: "CLOSED" };
      }
      const offered = await tx.tradeOffer.findUnique({
        where: { tradeId_cardId: { tradeId: trade.id, cardId: input.chosenCardId } },
        select: { card: { select: { rarity: true } } },
      });
      if (!offered) throw new TradeError("NOT_OFFERED");

      const players = await lockPlayers(tx, [trade.proposerId, trade.recipientId]);
      const proposer = players.get(trade.proposerId);
      const recipient = players.get(trade.recipientId);
      if (!proposer || !recipient || proposer.bannedAt || recipient.bannedAt) throw new TradeError("NO_USER");
      const relation = await friendsAndBlocks(tx, trade.proposerId, trade.recipientId);
      if (!relation.friends) throw new TradeError("NOT_FRIENDS");
      if (relation.blocked) throw new TradeError("BLOCKED");
      const wantedRarity = await tx.card.findUnique({ where: { id: trade.wantedCardId }, select: { rarity: true } });
      const allowed = new Set(input.allowedRarities);
      if (!wantedRarity || !allowed.has(wantedRarity.rarity as Rarity) || !allowed.has(offered.card.rarity as Rarity)) {
        throw new TradeError("RARITY");
      }

      const [wantedCopy, chosenCopy] = await Promise.all([
        freeCopy(tx, trade.recipientId, trade.wantedCardId),
        freeCopy(tx, trade.proposerId, input.chosenCardId),
      ]);
      if (!wantedCopy || !chosenCopy) {
        await tx.trade.update({ where: { id: trade.id }, data: { status: "FAILED", resolvedAt: now } });
        return { ok: false, code: "CARD_GONE" };
      }

      // « Nouveau » pour chacun : jamais obtenue avant cet échange
      const [recipientKnew, proposerKnew] = await Promise.all([
        tx.discovery.findUnique({ where: { userId_cardId: { userId: trade.recipientId, cardId: input.chosenCardId } }, select: { userId: true } }),
        tx.discovery.findUnique({ where: { userId_cardId: { userId: trade.proposerId, cardId: trade.wantedCardId } }, select: { userId: true } }),
      ]);

      // Transferts conditionnels : sous verrou ils réussissent, sinon tout est annulé
      const [toProposer, toRecipient] = await Promise.all([
        tx.userCard.updateMany({
          where: { id: wantedCopy.id, ownerId: trade.recipientId, status: "COLLECTION" },
          data: { ownerId: trade.proposerId, obtainedAt: now },
        }),
        tx.userCard.updateMany({
          where: { id: chosenCopy.id, ownerId: trade.proposerId, status: "COLLECTION" },
          data: { ownerId: trade.recipientId, obtainedAt: now },
        }),
      ]);
      if (toProposer.count !== 1 || toRecipient.count !== 1) throw new TradeError("CARD_GONE");
      await tx.showcaseSlot.deleteMany({ where: { userCardId: { in: [wantedCopy.id, chosenCopy.id] } } });
      await tx.discovery.createMany({
        data: [
          { userId: trade.proposerId, cardId: trade.wantedCardId, createdAt: now },
          { userId: trade.recipientId, cardId: input.chosenCardId, createdAt: now },
        ],
        skipDuplicates: true,
      });
      const [, recipientWished] = await Promise.all([
        consumeWishlist(tx, trade.proposerId, [trade.wantedCardId]),
        consumeWishlist(tx, trade.recipientId, [input.chosenCardId]),
      ]);

      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "ACCEPTED", chosenCardId: input.chosenCardId, resolvedAt: now, proposerNew: !proposerKnew },
      });
      await notify(tx, {
        userId: trade.proposerId,
        type: "TRADE_ACCEPTED",
        actorId: trade.recipientId,
        refId: trade.id,
        payload: { tradeId: trade.id, cardId: trade.wantedCardId },
        now,
      });
      return { ok: true, received: { cardId: input.chosenCardId, userCardId: chosenCopy.id, isNew: !recipientKnew, wished: recipientWished.size > 0 } };
    },
    TX,
    onNotified,
  );
}

/** L'ami refuse (motif facultatif, déjà nettoyé) : le proposant est prévenu. */
export async function declineTradeWith(
  db: PrismaClient,
  input: { userId: string; tradeId: string; note?: string | null; now?: Date },
  onNotified?: OnNotified,
) {
  const now = input.now ?? new Date();
  await notifyingTransaction(
    db,
    async (tx) => {
      const trade = await tx.trade.findUnique({ where: { id: input.tradeId }, select: { proposerId: true, recipientId: true, wantedCardId: true } });
      if (!trade || trade.recipientId !== input.userId) throw new TradeError("NOT_FOUND");
      const closed = await tx.trade.updateMany({
        where: { id: input.tradeId, recipientId: input.userId, status: "PENDING" },
        data: { status: "DECLINED", resolvedAt: now, declineNote: input.note ?? null },
      });
      if (closed.count !== 1) throw new TradeError("CLOSED");
      await notify(tx, {
        userId: trade.proposerId,
        type: "TRADE_DECLINED",
        actorId: input.userId,
        refId: input.tradeId,
        payload: { tradeId: input.tradeId, cardId: trade.wantedCardId },
        now,
      });
    },
    TX,
    onNotified,
  );
}

/** Le proposant retire sa proposition ; la notification de l'ami disparaît avec. */
export async function cancelTradeWith(db: PrismaClient, input: { userId: string; tradeId: string; now?: Date }) {
  const now = input.now ?? new Date();
  await db.$transaction(async (tx) => {
    const closed = await tx.trade.updateMany({
      where: { id: input.tradeId, proposerId: input.userId, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: now },
    });
    if (closed.count !== 1) throw new TradeError("CLOSED");
    await tx.notification.deleteMany({ where: { type: "TRADE_PROPOSED", refId: input.tradeId } });
  }, TX);
}

/** Passe en EXPIRED les propositions d'un joueur dont l'échéance est passée (balayage paresseux). */
export async function expireTradesFor(db: PrismaClient, userId: string, now = new Date()) {
  await db.trade.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now }, OR: [{ proposerId: userId }, { recipientId: userId }] },
    data: { status: "EXPIRED", resolvedAt: now },
  });
}

/** Le proposant a vu la révélation des cartes reçues. */
export async function markTradesSeenWith(db: PrismaClient, input: { userId: string; tradeIds: readonly string[]; now?: Date }) {
  await db.trade.updateMany({
    where: { id: { in: [...input.tradeIds] }, proposerId: input.userId, status: "ACCEPTED", proposerSeenAt: null },
    data: { proposerSeenAt: input.now ?? new Date() },
  });
}
