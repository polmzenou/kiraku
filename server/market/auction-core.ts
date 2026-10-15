// Hôtel des ventes, atomique. Le client Prisma est injecté (serveur ou test de concurrence) : pas
// de server/db.ts ici. Tous les montants viennent de la base ; le client n'envoie que des ids, la
// mise qu'il propose et le prix qu'il a vu.
//
// Séquestre : la mise en tête est déjà débitée du meneur (BID_HOLD) et lui est rendue s'il est
// dépassé (BID_REFUND), dans la même transaction que la nouvelle mise. À la clôture, le vendeur
// reçoit SALE + prix puis FEE − taxe. Invariant : Σ soldes + Σ currentBid des ventes ACTIVE + Σ taxes
// ne bouge pas (vérifié par market.db.test.ts).
//
// Ordre des verrous, partout : la vente (FOR UPDATE ou updateMany conditionnel) puis les joueurs,
// triés par id (lockPlayers). Deux mises croisées attendent l'une l'autre sans s'interbloquer.
import type { PrismaClient } from "@/generated/prisma/client";
import {
  buyoutAvailable,
  checkListing,
  checkTrader,
  extendedEndsAt,
  listingEndsAt,
  minNextBid,
  saleFee,
  type ListingRefusal,
  type MarketRules,
  type TraderRefusal,
} from "@/lib/market/rules";
import { pickGiftCopy } from "@/lib/social/gifts";
import { applyEntries, credit, debit, LedgerError } from "../economy/ledger";
import { lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";

export type AuctionErrorCode =
  | TraderRefusal
  | ListingRefusal
  | "NO_USER"
  | "NOT_OWNED"
  | "TOO_MANY_ACTIVE"
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_AUCTION"
  | "ALREADY_LEADING"
  | "TOO_LOW"
  | "NOT_ENOUGH_ZENI"
  | "HAS_BIDS"
  | "NO_BUYOUT"
  | "STALE";

export class AuctionError extends Error {
  constructor(readonly code: AuctionErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };

/** Ligne de vente lue sous verrou. */
type LockedAuction = {
  id: string;
  sellerId: string;
  userCardId: string | null;
  cardId: string;
  startPrice: number;
  buyoutPrice: number | null;
  currentBid: number | null;
  currentBidderId: string | null;
  feeBp: number;
  endsAt: Date;
  status: "ACTIVE" | "SOLD" | "EXPIRED" | "CANCELLED";
};

async function lockAuction(tx: Tx, auctionId: string): Promise<LockedAuction | null> {
  const [row] = await tx.$queryRaw<LockedAuction[]>`
    SELECT id, "sellerId", "userCardId", "cardId", "startPrice", "buyoutPrice", "currentBid",
           "currentBidderId", "feeBp", "endsAt", status::text AS status
    FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
  return row ?? null;
}

function isOpen(a: Pick<LockedAuction, "status" | "endsAt">, now: Date): boolean {
  return a.status === "ACTIVE" && a.endsAt > now;
}

// --- Mise en vente ---

export type CreateAuctionInput = {
  sellerId: string;
  /** Carte du catalogue : le serveur choisit l'exemplaire. */
  cardId: string;
  startPrice: number;
  buyoutPrice: number | null;
  durationHours: number;
  now: Date;
  rules: MarketRules;
};

/**
 * Met en vente un exemplaire de `cardId` : le plus récent hors vitrine, sinon le plus récent exposé
 * (son emplacement est libéré, la vitrine n'accepte que des cartes en collection). L'exemplaire
 * passe en AUCTION : il ne peut plus être offert, recyclé ni remis en vente.
 */
export async function createAuctionWith(
  db: PrismaClient,
  input: CreateAuctionInput,
): Promise<{ auctionId: string; userCardId: string; endsAt: Date }> {
  const refusal = checkListing(input, input.rules);
  if (refusal) throw new AuctionError(refusal);

  return db.$transaction(async (tx) => {
    const seller = (await lockPlayers(tx, [input.sellerId])).get(input.sellerId);
    if (!seller) throw new AuctionError("NO_USER");
    const notAllowed = checkTrader(seller, input.now, input.rules);
    if (notAllowed) throw new AuctionError(notAllowed);

    // Compté sous le verrou du vendeur : deux ventes simultanées ne dépassent pas la limite
    const active = await tx.auction.count({ where: { sellerId: input.sellerId, status: "ACTIVE" } });
    if (active >= input.rules.maxActivePerSeller) throw new AuctionError("TOO_MANY_ACTIVE");

    const copies = await tx.userCard.findMany({
      where: { ownerId: input.sellerId, cardId: input.cardId, status: "COLLECTION" },
      select: { id: true, obtainedAt: true },
    });
    const shown = await tx.showcaseSlot.findMany({
      where: { userId: input.sellerId, userCardId: { in: copies.map((c) => c.id) } },
      select: { userCardId: true },
    });
    const copy = pickGiftCopy(copies, new Set(shown.map((s) => s.userCardId)));
    if (!copy) throw new AuctionError("NOT_OWNED");

    // Réservation conditionnelle : un exemplaire offert ou recyclé entre-temps n'est jamais vendu
    const reserved = await tx.userCard.updateMany({
      where: { id: copy.id, ownerId: input.sellerId, status: "COLLECTION" },
      data: { status: "AUCTION" },
    });
    if (reserved.count !== 1) throw new AuctionError("NOT_OWNED");
    await tx.showcaseSlot.deleteMany({ where: { userCardId: copy.id } });

    const endsAt = listingEndsAt(input.now, input.durationHours);
    const auction = await tx.auction.create({
      data: {
        sellerId: input.sellerId,
        userCardId: copy.id,
        cardId: input.cardId,
        startPrice: input.startPrice,
        buyoutPrice: input.buyoutPrice,
        price: input.startPrice,
        feeBp: input.rules.feeBp,
        endsAt,
        createdAt: input.now,
      },
      select: { id: true },
    });
    return { auctionId: auction.id, userCardId: copy.id, endsAt };
  }, TX);
}

// --- Mises ---

export type BidOutcome = {
  auctionId: string;
  currentBid: number;
  endsAt: Date;
  /** Solde de l'enchérisseur après la mise. */
  coins: number;
  /** La mise a atteint l'achat immédiat : la vente est conclue. */
  sold: boolean;
};

type BidRequest = {
  bidderId: string;
  auctionId: string;
  now: Date;
  rules: MarketRules;
} & ({ kind: "bid"; amount: number } | { kind: "buyout"; expectedPrice: number });

async function bidInTx(tx: Tx, req: BidRequest): Promise<BidOutcome> {
  const { now, rules } = req;
  const a = await lockAuction(tx, req.auctionId);
  if (!a) throw new AuctionError("NOT_FOUND");
  if (!isOpen(a, now)) throw new AuctionError("CLOSED");
  if (a.sellerId === req.bidderId) throw new AuctionError("OWN_AUCTION");
  if (a.currentBidderId === req.bidderId) throw new AuctionError("ALREADY_LEADING");

  const canBuyout = buyoutAvailable(a.buyoutPrice, a.currentBid);
  let amount: number;
  if (req.kind === "buyout") {
    if (!canBuyout) throw new AuctionError("NO_BUYOUT");
    if (a.buyoutPrice !== req.expectedPrice) throw new AuctionError("STALE");
    amount = a.buyoutPrice;
  } else {
    if (!Number.isSafeInteger(req.amount) || req.amount > rules.maxPrice) throw new AuctionError("INVALID_PRICE");
    // Une mise qui atteint l'achat immédiat achète au prix d'achat immédiat, pas au-delà
    amount = canBuyout && req.amount >= a.buyoutPrice! ? a.buyoutPrice! : req.amount;
    if (amount < minNextBid(a.currentBid, a.startPrice, rules.minIncrementBp)) throw new AuctionError("TOO_LOW");
  }
  const sold = canBuyout && amount === a.buyoutPrice;

  // Tous les joueurs touchés par cette transaction, verrouillés d'un coup dans l'ordre des ids
  const involved = [req.bidderId, ...(a.currentBidderId ? [a.currentBidderId] : []), ...(sold ? [a.sellerId] : [])];
  const players = await lockPlayers(tx, involved);
  const bidder = players.get(req.bidderId);
  if (!bidder) throw new AuctionError("NO_USER");
  const notAllowed = checkTrader(bidder, now, rules);
  if (notAllowed) throw new AuctionError(notAllowed);

  let coins: number;
  try {
    coins = await debit(tx, { userId: req.bidderId, amount, reason: "BID_HOLD", refId: a.id, now });
  } catch (e) {
    if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new AuctionError("NOT_ENOUGH_ZENI");
    throw e;
  }
  if (a.currentBidderId && a.currentBid !== null) {
    await credit(tx, { userId: a.currentBidderId, amount: a.currentBid, reason: "BID_REFUND", refId: a.id, now });
    await notify(tx, {
      userId: a.currentBidderId,
      type: "OUTBID",
      actorId: req.bidderId,
      refId: a.id,
      payload: { auctionId: a.id, cardId: a.cardId, amount },
      now,
    });
  }

  await tx.bid.create({ data: { auctionId: a.id, bidderId: req.bidderId, amount, createdAt: now } });
  const endsAt = sold ? now : extendedEndsAt(a.endsAt, now, rules.antiSnipeSeconds, rules.extendSeconds);
  await tx.auction.update({
    where: { id: a.id },
    data: { currentBid: amount, currentBidderId: req.bidderId, price: amount, bidCount: { increment: 1 }, endsAt },
  });

  if (sold) {
    await tx.auction.update({ where: { id: a.id }, data: { status: "SOLD", settledAt: now, finalPrice: amount, fee: saleFee(amount, a.feeBp) } });
    await deliverSale(tx, { ...a, currentBid: amount, currentBidderId: req.bidderId }, now);
  }
  return { auctionId: a.id, currentBid: amount, endsAt, coins, sold };
}

/** Mise sur une vente ouverte. Refusée sous la surenchère minimale ou si le solde ne suffit pas. */
export async function placeBidWith(
  db: PrismaClient,
  input: { bidderId: string; auctionId: string; amount: number; now: Date; rules: MarketRules },
  onNotified?: OnNotified,
): Promise<BidOutcome> {
  return notifyingTransaction(db, (tx) => bidInTx(tx, { ...input, kind: "bid" }), TX, onNotified);
}

/** Achat immédiat au prix affiché (`expectedPrice`) ; STALE s'il a changé depuis l'affichage. */
export async function buyNowWith(
  db: PrismaClient,
  input: { buyerId: string; auctionId: string; expectedPrice: number; now: Date; rules: MarketRules },
  onNotified?: OnNotified,
): Promise<BidOutcome> {
  return notifyingTransaction(
    db,
    (tx) => bidInTx(tx, { bidderId: input.buyerId, auctionId: input.auctionId, now: input.now, rules: input.rules, kind: "buyout", expectedPrice: input.expectedPrice }),
    TX,
    onNotified,
  );
}

// --- Clôture ---

type SoldAuction = Pick<LockedAuction, "id" | "sellerId" | "userCardId" | "cardId" | "feeBp"> & {
  currentBid: number;
  currentBidderId: string;
};

/**
 * Livre une vente conclue (statut déjà passé à SOLD dans cette transaction) : la carte change de
 * propriétaire, le séquestre devient le paiement du vendeur moins la taxe.
 */
async function deliverSale(tx: Tx, a: SoldAuction, now: Date) {
  const buyerId = a.currentBidderId;
  const moved = a.userCardId
    ? await tx.userCard.updateMany({
        where: { id: a.userCardId, ownerId: a.sellerId, status: "AUCTION" },
        data: { ownerId: buyerId, status: "COLLECTION", obtainedAt: now },
      })
    : { count: 0 };
  // Une carte réservée ne peut ni être recyclée, ni offerte, ni changer de main : bug, on annule tout
  if (moved.count !== 1) throw new Error(`Vente ${a.id} : exemplaire réservé introuvable`);
  await tx.showcaseSlot.deleteMany({ where: { userCardId: a.userCardId! } });
  await tx.discovery.createMany({ data: [{ userId: buyerId, cardId: a.cardId, createdAt: now }], skipDuplicates: true });

  const fee = saleFee(a.currentBid, a.feeBp);
  await applyEntries(
    tx,
    a.sellerId,
    [
      { amount: a.currentBid, reason: "SALE", refId: a.id },
      ...(fee > 0 ? [{ amount: -fee, reason: "FEE" as const, refId: a.id }] : []),
    ],
    now,
  );
  const payload = { auctionId: a.id, cardId: a.cardId, amount: a.currentBid };
  await notify(tx, { userId: buyerId, type: "AUCTION_WON", actorId: a.sellerId, refId: a.id, payload, now });
  await notify(tx, { userId: a.sellerId, type: "AUCTION_SOLD", actorId: buyerId, refId: a.id, payload, now });
}

/** Rend la carte réservée à son vendeur (vente expirée ou annulée). */
async function returnCard(tx: Tx, a: Pick<LockedAuction, "id" | "sellerId" | "userCardId">) {
  const back = a.userCardId
    ? await tx.userCard.updateMany({
        where: { id: a.userCardId, ownerId: a.sellerId, status: "AUCTION" },
        data: { status: "COLLECTION" },
      })
    : { count: 0 };
  if (back.count !== 1) throw new Error(`Vente ${a.id} : exemplaire réservé introuvable`);
}

export type SettleOutcome = { settled: false } | { settled: true; status: "SOLD" | "EXPIRED" };

/**
 * Clôt une vente terminée. Idempotent : le passage ACTIVE → SOLD | EXPIRED est un updateMany
 * conditionnel ; si une autre clôture (cron, page affichée) est passée avant, count = 0 et on
 * s'arrête. La condition sur currentBid écarte aussi une mise validée entre la lecture et l'écriture.
 */
export async function settleAuctionWith(
  db: PrismaClient,
  auctionId: string,
  now: Date,
  onNotified?: OnNotified,
): Promise<SettleOutcome> {
  return notifyingTransaction(
    db,
    async (tx): Promise<SettleOutcome> => {
      const a = await tx.auction.findUnique({
        where: { id: auctionId },
        select: { id: true, sellerId: true, userCardId: true, cardId: true, feeBp: true, currentBid: true, currentBidderId: true, status: true, endsAt: true },
      });
      if (!a || a.status !== "ACTIVE" || a.endsAt > now) return { settled: false };

      const sold = a.currentBid !== null && a.currentBidderId !== null;
      const closed = await tx.auction.updateMany({
        where: { id: a.id, status: "ACTIVE", endsAt: { lte: now }, currentBid: a.currentBid, currentBidderId: a.currentBidderId },
        data: sold
          ? { status: "SOLD", settledAt: now, finalPrice: a.currentBid, fee: saleFee(a.currentBid!, a.feeBp) }
          : { status: "EXPIRED", settledAt: now },
      });
      if (closed.count !== 1) return { settled: false };

      if (sold) {
        await deliverSale(tx, { ...a, currentBid: a.currentBid!, currentBidderId: a.currentBidderId! }, now);
        return { settled: true, status: "SOLD" };
      }
      await returnCard(tx, a);
      await notify(tx, {
        userId: a.sellerId,
        type: "AUCTION_EXPIRED",
        actorId: a.sellerId,
        refId: a.id,
        payload: { auctionId: a.id, cardId: a.cardId, amount: null },
        now,
      });
      return { settled: true, status: "EXPIRED" };
    },
    TX,
    onNotified,
  );
}

/**
 * Balayage du cron : clôt les ventes terminées, les plus anciennes d'abord (index [status, endsAt]).
 * Une transaction par vente ; un échec est journalisé et n'arrête pas le balayage.
 */
export async function settleDueWith(
  db: PrismaClient,
  now: Date,
  limit = 100,
  onNotified?: OnNotified,
): Promise<{ settled: number; failed: number }> {
  const due = await db.auction.findMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    orderBy: [{ endsAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  let settled = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      if ((await settleAuctionWith(db, id, now, onNotified)).settled) settled++;
    } catch (e) {
      failed++;
      console.error(`[marche] clôture de ${id}`, e);
    }
  }
  return { settled, failed };
}

// --- Annulation ---

/** Annulation par le vendeur, seulement tant que personne n'a misé. */
export async function cancelAuctionWith(
  db: PrismaClient,
  input: { sellerId: string; auctionId: string; now: Date },
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Conditionnel : une mise validée avant nous (verrou de la ligne) fait échouer l'annulation
    const cancelled = await tx.auction.updateMany({
      where: { id: input.auctionId, sellerId: input.sellerId, status: "ACTIVE", endsAt: { gt: input.now }, currentBidderId: null },
      data: { status: "CANCELLED", cancelledAt: input.now, cancelledById: input.sellerId },
    });
    if (cancelled.count !== 1) {
      const a = await tx.auction.findUnique({ where: { id: input.auctionId }, select: { sellerId: true, status: true, endsAt: true, bidCount: true } });
      if (!a || a.sellerId !== input.sellerId) throw new AuctionError("NOT_FOUND");
      if (!isOpen(a, input.now)) throw new AuctionError("CLOSED");
      throw new AuctionError("HAS_BIDS");
    }
    const a = await tx.auction.findUniqueOrThrow({ where: { id: input.auctionId }, select: { id: true, sellerId: true, userCardId: true } });
    await returnCard(tx, a);
  }, TX);
}

/** Annulation par un admin, même avec des mises : la mise en tête est rendue, la carte revient au vendeur. */
export async function adminCancelAuctionWith(
  db: PrismaClient,
  input: { adminId: string; auctionId: string; now: Date },
  onNotified?: OnNotified,
): Promise<void> {
  await notifyingTransaction(
    db,
    async (tx) => {
      const a = await lockAuction(tx, input.auctionId);
      if (!a) throw new AuctionError("NOT_FOUND");
      if (a.status !== "ACTIVE") throw new AuctionError("CLOSED");

      await tx.auction.update({
        where: { id: a.id },
        data: { status: "CANCELLED", cancelledAt: input.now, cancelledById: input.adminId },
      });
      const payload = { auctionId: a.id, cardId: a.cardId, amount: a.currentBid };
      if (a.currentBidderId && a.currentBid !== null) {
        await lockPlayers(tx, [a.currentBidderId]);
        await credit(tx, { userId: a.currentBidderId, amount: a.currentBid, reason: "BID_REFUND", refId: a.id, now: input.now });
        await notify(tx, { userId: a.currentBidderId, type: "AUCTION_CANCELLED", actorId: a.sellerId, refId: a.id, payload, now: input.now });
      }
      await returnCard(tx, a);
      await notify(tx, { userId: a.sellerId, type: "AUCTION_CANCELLED", actorId: a.sellerId, refId: a.id, payload, now: input.now });
      await tx.adminLog.create({
        data: {
          adminId: input.adminId,
          action: "AUCTION_CANCEL",
          targetType: "Auction",
          targetId: a.id,
          before: { status: a.status, currentBid: a.currentBid, currentBidderId: a.currentBidderId },
          after: { status: "CANCELLED", refunded: a.currentBid ?? 0 },
        },
      });
    },
    TX,
    onNotified,
  );
}
