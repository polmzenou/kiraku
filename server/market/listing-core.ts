// Échanges ouverts du Marché, atomiques. Le client Prisma est injecté (serveur ou test de concurrence).
//
// « Je donne celle-ci contre l'une de celles-là » : l'auteur publie une carte et jusqu'à N cartes
// demandées ; n'importe quel joueur propose une des siennes, l'auteur accepte ou refuse. Rien n'est
// bloqué pendant l'attente. À l'acceptation, l'annonce puis l'offre puis les deux joueurs sont
// verrouillés (même ordre que l'hôtel des ventes : les lignes d'objet, puis les joueurs triés par id),
// les blocages et un exemplaire libre de chaque côté sont relus, puis les deux exemplaires changent
// de propriétaire par des updateMany conditionnels.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Rarity } from "@/lib/catalog/rarity";
import {
  checkExchanger,
  checkListingOffer,
  checkTradeListing,
  isListingOpen,
  listingExpiresAt,
  uniqueWants,
  type ExchangerRefusal,
  type ListingOfferRefusal,
  type ListingRules,
  type TradeListingRefusal,
} from "@/lib/market/listings";
import { freeCopy } from "../social/free-copy";
import { blocksBetween, lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { consumeWishlist } from "../collection/wishlist-core";

export type ListingErrorCode =
  | TradeListingRefusal
  | ListingOfferRefusal
  | ExchangerRefusal
  | "NO_USER"
  | "CARD_GONE"
  | "OFFER_GONE"
  | "WANT_GONE"
  | "NOT_FOUND";

export class ListingError extends Error {
  constructor(readonly code: ListingErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 15_000 };
const DAY_MS = 24 * 3_600_000;

type LockedListing = { id: string; ownerId: string; cardId: string; status: string; expiresAt: Date };
type LockedOffer = { id: string; listingId: string; bidderId: string; cardId: string; status: string };

async function lockListing(tx: Tx, listingId: string): Promise<LockedListing | null> {
  const [row] = await tx.$queryRaw<LockedListing[]>`
    SELECT id, "ownerId", "cardId", status::text AS status, "expiresAt"
    FROM "TradeListing" WHERE id = ${listingId} FOR UPDATE`;
  return row ?? null;
}

async function lockOffer(tx: Tx, offerId: string): Promise<LockedOffer | null> {
  const [row] = await tx.$queryRaw<LockedOffer[]>`
    SELECT id, "listingId", "bidderId", "cardId", status::text AS status
    FROM "ListingOffer" WHERE id = ${offerId} FOR UPDATE`;
  return row ?? null;
}

/** Ferme les offres en attente d'une annonce et prévient leurs auteurs (sauf `except`). */
async function closePendingOffers(tx: Tx, listing: LockedListing, now: Date, except?: string) {
  const pending = await tx.listingOffer.findMany({
    where: { listingId: listing.id, status: "PENDING", ...(except ? { id: { not: except } } : {}) },
    select: { id: true, bidderId: true, cardId: true },
  });
  if (pending.length === 0) return;
  await tx.listingOffer.updateMany({
    where: { id: { in: pending.map((o) => o.id) }, status: "PENDING" },
    data: { status: "CLOSED", resolvedAt: now },
  });
  // La notification « nouvelle offre » de l'auteur n'a plus d'objet
  await tx.notification.updateMany({
    where: { userId: listing.ownerId, type: "LISTING_OFFER", refId: { in: pending.map((o) => o.id) }, readAt: null },
    data: { readAt: now },
  });
  for (const offer of pending) {
    await notify(tx, {
      userId: offer.bidderId,
      type: "LISTING_DECLINED",
      actorId: listing.ownerId,
      refId: offer.id,
      payload: { listingId: listing.id, offerId: offer.id, cardId: listing.cardId, offeredCardId: offer.cardId },
      now,
    });
  }
}

export type CreateListingInput = { ownerId: string; cardId: string; wantedCardIds: readonly string[]; rules: ListingRules; now?: Date };

/** Publie « ma carte X contre l'une de celles-ci » : tout est vérifié sous le verrou de l'auteur. */
export async function createListingWith(db: PrismaClient, input: CreateListingInput): Promise<{ listingId: string }> {
  const now = input.now ?? new Date();
  const wants = uniqueWants(input.wantedCardIds);
  return db.$transaction(async (tx) => {
    const owner = (await lockPlayers(tx, [input.ownerId])).get(input.ownerId);
    if (!owner) throw new ListingError("NO_USER");
    const refusal = checkExchanger(owner, now, input.rules);
    if (refusal) throw new ListingError(refusal);

    const [cards, ownedWants, offeredFree, duplicate, active, createdLastDay] = await Promise.all([
      tx.card.findMany({ where: { id: { in: [input.cardId, ...wants] }, status: "PUBLISHED" }, select: { id: true, rarity: true } }),
      tx.userCard.count({ where: { ownerId: input.ownerId, cardId: { in: wants } } }),
      tx.userCard.count({ where: { ownerId: input.ownerId, cardId: input.cardId, status: "COLLECTION" } }),
      tx.tradeListing.count({ where: { ownerId: input.ownerId, cardId: input.cardId, status: "OPEN", expiresAt: { gt: now } } }),
      tx.tradeListing.count({ where: { ownerId: input.ownerId, status: "OPEN", expiresAt: { gt: now } } }),
      tx.tradeListing.count({ where: { ownerId: input.ownerId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } }),
    ]);
    const rarity = new Map(cards.map((c) => [c.id, c.rarity as Rarity]));
    const offeredRarity = rarity.get(input.cardId);
    if (!offeredRarity || offeredFree === 0) throw new ListingError("CARD_GONE");
    if (wants.some((id) => !rarity.has(id))) throw new ListingError("WANT_GONE");

    const listingRefusal = checkTradeListing({
      offered: { cardId: input.cardId, rarity: offeredRarity },
      wants: wants.map((id) => ({ cardId: id, rarity: rarity.get(id)! })),
      ownedWants,
      duplicate: duplicate > 0,
      active,
      createdLastDay,
      rules: input.rules,
    });
    if (listingRefusal) throw new ListingError(listingRefusal);

    const listing = await tx.tradeListing.create({
      data: {
        ownerId: input.ownerId,
        cardId: input.cardId,
        expiresAt: listingExpiresAt(now, input.rules.expiryHours),
        createdAt: now,
        wants: { create: wants.map((cardId) => ({ cardId })) },
      },
      select: { id: true },
    });
    return { listingId: listing.id };
  }, TX);
}

/** L'auteur retire son annonce ; les offres en attente sont fermées et leurs auteurs prévenus. */
export async function cancelListingWith(db: PrismaClient, input: { userId: string; listingId: string; now?: Date }, onNotified?: OnNotified) {
  const now = input.now ?? new Date();
  await notifyingTransaction(
    db,
    async (tx) => {
      const listing = await lockListing(tx, input.listingId);
      if (!listing || listing.ownerId !== input.userId) throw new ListingError("NOT_FOUND");
      if (listing.status !== "OPEN") throw new ListingError("CLOSED");
      await tx.tradeListing.update({ where: { id: listing.id }, data: { status: "CANCELLED", resolvedAt: now } });
      await closePendingOffers(tx, listing, now);
    },
    TX,
    onNotified,
  );
}

export type MakeOfferInput = { bidderId: string; listingId: string; cardId: string; rules: ListingRules; now?: Date };

/** Un joueur propose une de ses cartes sur une annonce ; l'auteur est notifié. */
export async function makeOfferWith(db: PrismaClient, input: MakeOfferInput, onNotified?: OnNotified): Promise<{ offerId: string }> {
  const now = input.now ?? new Date();
  return notifyingTransaction(
    db,
    async (tx) => {
      const listing = await lockListing(tx, input.listingId);
      if (!listing) throw new ListingError("NOT_FOUND");
      const players = await lockPlayers(tx, [listing.ownerId, input.bidderId]);
      const owner = players.get(listing.ownerId);
      const bidder = players.get(input.bidderId);
      if (!bidder) throw new ListingError("NO_USER");
      const refusal = checkExchanger(bidder, now, input.rules);
      if (refusal) throw new ListingError(refusal);
      if (!owner || owner.bannedAt) throw new ListingError("CLOSED");

      const [blocks, card, want, alreadyOffered, pendingOffers, free] = await Promise.all([
        blocksBetween(tx, input.bidderId, listing.ownerId),
        tx.card.findUnique({ where: { id: input.cardId }, select: { rarity: true } }),
        tx.tradeListingWant.findUnique({ where: { listingId_cardId: { listingId: listing.id, cardId: input.cardId } }, select: { cardId: true } }),
        tx.listingOffer.count({ where: { listingId: listing.id, bidderId: input.bidderId, status: "PENDING" } }),
        tx.listingOffer.count({
          where: { bidderId: input.bidderId, status: "PENDING", listing: { status: "OPEN", expiresAt: { gt: now } } },
        }),
        tx.userCard.count({ where: { ownerId: input.bidderId, cardId: input.cardId, status: "COLLECTION" } }),
      ]);
      if (!card) throw new ListingError("OFFER_GONE");
      const offerRefusal = checkListingOffer({
        listing,
        bidderId: input.bidderId,
        offered: { cardId: input.cardId, rarity: card.rarity as Rarity },
        fromWants: want !== null,
        blocked: blocks.byMe || blocks.byThem,
        alreadyOffered: alreadyOffered > 0,
        pendingOffers,
        rules: input.rules,
        now,
      });
      if (offerRefusal) throw new ListingError(offerRefusal);
      if (free === 0) throw new ListingError("OFFER_GONE");

      const offer = await tx.listingOffer.create({
        data: { listingId: listing.id, bidderId: input.bidderId, cardId: input.cardId, fromWants: want !== null, createdAt: now },
        select: { id: true },
      });
      await notify(tx, {
        userId: listing.ownerId,
        type: "LISTING_OFFER",
        actorId: input.bidderId,
        refId: offer.id,
        payload: { listingId: listing.id, offerId: offer.id, cardId: listing.cardId, offeredCardId: input.cardId },
        now,
      });
      return { offerId: offer.id };
    },
    TX,
    onNotified,
  );
}

/** L'offrant retire son offre ; la notification de l'auteur disparaît avec. */
export async function withdrawOfferWith(db: PrismaClient, input: { userId: string; offerId: string; now?: Date }) {
  const now = input.now ?? new Date();
  await db.$transaction(async (tx) => {
    const closed = await tx.listingOffer.updateMany({
      where: { id: input.offerId, bidderId: input.userId, status: "PENDING" },
      data: { status: "WITHDRAWN", resolvedAt: now },
    });
    if (closed.count !== 1) throw new ListingError("CLOSED");
    await tx.notification.deleteMany({ where: { type: "LISTING_OFFER", refId: input.offerId } });
  }, TX);
}

export type AcceptOfferOutcome =
  | { ok: true; received: { cardId: string; userCardId: string; isNew: boolean; wished: boolean } }
  | { ok: false; code: "CLOSED" | "CARD_GONE" | "OFFER_GONE" };

/**
 * L'auteur accepte une offre. Une annonce expirée passe en EXPIRED ; si sa carte n'est plus là,
 * l'annonce passe en FAILED ; si celle de l'offrant manque, seule l'offre passe en FAILED et
 * l'annonce reste ouverte. Ces changements d'état sont validés, l'échange n'a simplement pas lieu.
 */
export async function acceptOfferWith(
  db: PrismaClient,
  input: { userId: string; offerId: string; allowedRarities: readonly Rarity[]; now?: Date },
  onNotified?: OnNotified,
): Promise<AcceptOfferOutcome> {
  const now = input.now ?? new Date();
  return notifyingTransaction(
    db,
    async (tx): Promise<AcceptOfferOutcome> => {
      const ref = await tx.listingOffer.findUnique({ where: { id: input.offerId }, select: { listingId: true } });
      if (!ref) throw new ListingError("NOT_FOUND");
      const listing = await lockListing(tx, ref.listingId);
      const offer = await lockOffer(tx, input.offerId);
      if (!listing || !offer || listing.ownerId !== input.userId) throw new ListingError("NOT_FOUND");
      if (offer.status !== "PENDING" || listing.status !== "OPEN") throw new ListingError("CLOSED");
      const payload = { listingId: listing.id, offerId: offer.id, cardId: listing.cardId, offeredCardId: offer.cardId };
      if (!isListingOpen(listing, now)) {
        await tx.tradeListing.update({ where: { id: listing.id }, data: { status: "EXPIRED", resolvedAt: now } });
        await closePendingOffers(tx, listing, now);
        return { ok: false, code: "CLOSED" };
      }

      const players = await lockPlayers(tx, [listing.ownerId, offer.bidderId]);
      const owner = players.get(listing.ownerId);
      const bidder = players.get(offer.bidderId);
      if (!owner || !bidder || owner.bannedAt || bidder.bannedAt) throw new ListingError("NO_USER");
      const blocks = await blocksBetween(tx, listing.ownerId, offer.bidderId);
      if (blocks.byMe || blocks.byThem) throw new ListingError("BLOCKED");
      const rarities = await tx.card.findMany({ where: { id: { in: [listing.cardId, offer.cardId] } }, select: { rarity: true } });
      const allowed = new Set(input.allowedRarities);
      if (rarities.length !== 2 || rarities.some((c) => !allowed.has(c.rarity as Rarity))) throw new ListingError("RARITY");

      const [ownerCopy, bidderCopy] = await Promise.all([
        freeCopy(tx, listing.ownerId, listing.cardId),
        freeCopy(tx, offer.bidderId, offer.cardId),
      ]);
      if (!ownerCopy) {
        await tx.tradeListing.update({ where: { id: listing.id }, data: { status: "FAILED", resolvedAt: now } });
        await closePendingOffers(tx, listing, now);
        return { ok: false, code: "CARD_GONE" };
      }
      if (!bidderCopy) {
        await tx.listingOffer.update({ where: { id: offer.id }, data: { status: "FAILED", resolvedAt: now } });
        await tx.notification.updateMany({ where: { type: "LISTING_OFFER", refId: offer.id, readAt: null }, data: { readAt: now } });
        await notify(tx, { userId: offer.bidderId, type: "LISTING_DECLINED", actorId: listing.ownerId, refId: offer.id, payload, now });
        return { ok: false, code: "OFFER_GONE" };
      }

      // « Nouveau » pour chacun : jamais obtenue avant cet échange
      const [ownerKnew, bidderKnew] = await Promise.all([
        tx.discovery.findUnique({ where: { userId_cardId: { userId: listing.ownerId, cardId: offer.cardId } }, select: { userId: true } }),
        tx.discovery.findUnique({ where: { userId_cardId: { userId: offer.bidderId, cardId: listing.cardId } }, select: { userId: true } }),
      ]);

      // Transferts conditionnels : sous verrou ils réussissent, sinon tout est annulé
      const [toBidder, toOwner] = await Promise.all([
        tx.userCard.updateMany({
          where: { id: ownerCopy.id, ownerId: listing.ownerId, status: "COLLECTION" },
          data: { ownerId: offer.bidderId, obtainedAt: now },
        }),
        tx.userCard.updateMany({
          where: { id: bidderCopy.id, ownerId: offer.bidderId, status: "COLLECTION" },
          data: { ownerId: listing.ownerId, obtainedAt: now },
        }),
      ]);
      if (toBidder.count !== 1 || toOwner.count !== 1) throw new ListingError("CARD_GONE");
      await tx.showcaseSlot.deleteMany({ where: { userCardId: { in: [ownerCopy.id, bidderCopy.id] } } });
      await tx.discovery.createMany({
        data: [
          { userId: offer.bidderId, cardId: listing.cardId, createdAt: now },
          { userId: listing.ownerId, cardId: offer.cardId, createdAt: now },
        ],
        skipDuplicates: true,
      });
      const [, ownerWished] = await Promise.all([
        consumeWishlist(tx, offer.bidderId, [listing.cardId]),
        consumeWishlist(tx, listing.ownerId, [offer.cardId]),
      ]);

      await tx.tradeListing.update({ where: { id: listing.id }, data: { status: "TRADED", resolvedAt: now } });
      await tx.listingOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", resolvedAt: now, bidderNew: !bidderKnew } });
      await tx.notification.updateMany({ where: { type: "LISTING_OFFER", refId: offer.id, readAt: null }, data: { readAt: now } });
      await closePendingOffers(tx, listing, now, offer.id);
      await notify(tx, { userId: offer.bidderId, type: "LISTING_ACCEPTED", actorId: listing.ownerId, refId: offer.id, payload, now });
      return { ok: true, received: { cardId: offer.cardId, userCardId: bidderCopy.id, isNew: !ownerKnew, wished: ownerWished.size > 0 } };
    },
    TX,
    onNotified,
  );
}

/** L'auteur refuse une offre : l'offrant est prévenu, l'annonce reste ouverte. */
export async function declineOfferWith(db: PrismaClient, input: { userId: string; offerId: string; now?: Date }, onNotified?: OnNotified) {
  const now = input.now ?? new Date();
  await notifyingTransaction(
    db,
    async (tx) => {
      const offer = await tx.listingOffer.findUnique({
        where: { id: input.offerId },
        select: { id: true, bidderId: true, cardId: true, listing: { select: { id: true, ownerId: true, cardId: true } } },
      });
      if (!offer || offer.listing.ownerId !== input.userId) throw new ListingError("NOT_FOUND");
      const closed = await tx.listingOffer.updateMany({
        where: { id: offer.id, status: "PENDING" },
        data: { status: "DECLINED", resolvedAt: now },
      });
      if (closed.count !== 1) throw new ListingError("CLOSED");
      await tx.notification.updateMany({ where: { type: "LISTING_OFFER", refId: offer.id, readAt: null }, data: { readAt: now } });
      await notify(tx, {
        userId: offer.bidderId,
        type: "LISTING_DECLINED",
        actorId: input.userId,
        refId: offer.id,
        payload: { listingId: offer.listing.id, offerId: offer.id, cardId: offer.listing.cardId, offeredCardId: offer.cardId },
        now,
      });
    },
    TX,
    onNotified,
  );
}

/**
 * Passe en EXPIRED les annonces échues qui concernent un joueur (les siennes, ou celles où il a une
 * offre en attente) et ferme leurs offres. Balayage paresseux, à la lecture de « Mes échanges ».
 */
export async function expireListingsFor(db: PrismaClient, userId: string, now = new Date()) {
  const due = await db.tradeListing.findMany({
    where: {
      status: "OPEN",
      expiresAt: { lte: now },
      OR: [{ ownerId: userId }, { offers: { some: { bidderId: userId, status: "PENDING" } } }],
    },
    select: { id: true },
    take: 100,
  });
  if (due.length === 0) return;
  const ids = due.map((l) => l.id);
  await db.$transaction([
    db.tradeListing.updateMany({ where: { id: { in: ids }, status: "OPEN" }, data: { status: "EXPIRED", resolvedAt: now } }),
    db.listingOffer.updateMany({ where: { listingId: { in: ids }, status: "PENDING" }, data: { status: "CLOSED", resolvedAt: now } }),
  ]);
}

/** L'offrant a vu la révélation des cartes reçues. */
export async function markListingRevealsSeenWith(db: PrismaClient, input: { userId: string; offerIds: readonly string[]; now?: Date }) {
  await db.listingOffer.updateMany({
    where: { id: { in: [...input.offerIds] }, bidderId: input.userId, status: "ACCEPTED", bidderSeenAt: null },
    data: { bidderSeenAt: input.now ?? new Date() },
  });
}
