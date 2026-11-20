import "server-only";
import { sortExchanges, type Exchange, type ExchangeCard } from "@/lib/anticheat/exchanges";
import { prisma } from "../db";

// Transferts entre deux comptes, un par ligne, avec les mêmes filtres que la détection
// (server/anticheat/queries.ts, loadDetection) : la liste retombe sur le chiffre affiché par la puce.

/** Au plus autant de lignes par source : une paire hors norme ne fait pas exploser la page. */
const PER_SOURCE = 500;

/** Les deux sens d'une paire, pour un couple de colonnes (x, y). */
function both<X extends string, Y extends string>(x: X, y: Y, a: string, b: string) {
  return [{ [x]: a, [y]: b }, { [x]: b, [y]: a }] as Record<X | Y, string>[];
}

/** Transferts entre `a` et `b`, les plus récents d'abord ; `truncated` si une source a atteint la limite. */
export async function exchangesBetween(a: string, b: string): Promise<{ rows: Exchange[]; truncated: boolean }> {
  const [gifts, auctions, orders, flips, trades, offers] = await Promise.all([
    prisma.gift.findMany({
      where: { OR: both("senderId", "recipientId", a, b) },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, senderId: true, recipientId: true, kind: true, cardId: true, zeniSpent: true, createdAt: true },
    }),
    prisma.auction.findMany({
      where: { status: "SOLD", OR: both("sellerId", "currentBidderId", a, b) },
      orderBy: { endsAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, sellerId: true, currentBidderId: true, cardId: true, finalPrice: true, currentBid: true, price: true, settledAt: true, endsAt: true },
    }),
    prisma.buyOrder.findMany({
      where: { status: "FILLED", OR: both("sellerId", "buyerId", a, b) },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, sellerId: true, buyerId: true, cardId: true, price: true, filledAt: true, createdAt: true },
    }),
    prisma.coinFlip.findMany({
      where: { status: "DONE", winnerId: { not: null }, OR: both("creatorId", "opponentId", a, b) },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, creatorId: true, opponentId: true, winnerId: true, creatorCardId: true, opponentCardId: true, resolvedAt: true, createdAt: true },
    }),
    prisma.trade.findMany({
      where: { status: "ACCEPTED", OR: both("proposerId", "recipientId", a, b) },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, proposerId: true, recipientId: true, wantedCardId: true, chosenCardId: true, resolvedAt: true, createdAt: true },
    }),
    prisma.listingOffer.findMany({
      where: {
        status: "ACCEPTED",
        OR: [
          { bidderId: b, listing: { ownerId: a } },
          { bidderId: a, listing: { ownerId: b } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, bidderId: true, cardId: true, resolvedAt: true, createdAt: true, listing: { select: { ownerId: true, cardId: true } } },
    }),
  ]);

  const cardIds = new Set<string>();
  const want = (id: string | null) => id && cardIds.add(id);
  gifts.forEach((g) => want(g.cardId));
  auctions.forEach((x) => want(x.cardId));
  orders.forEach((x) => want(x.cardId));
  flips.forEach((f) => (want(f.creatorCardId), want(f.opponentCardId)));
  trades.forEach((t) => (want(t.wantedCardId), want(t.chosenCardId)));
  offers.forEach((o) => (want(o.cardId), want(o.listing.cardId)));
  const cards = new Map(
    (await prisma.card.findMany({ where: { id: { in: [...cardIds] } }, select: { id: true, name: true, rarity: true, publicId: true } })).map((c) => [c.id, c]),
  );
  const card = (id: string | null): ExchangeCard => (id ? (cards.get(id) ?? null) : null);

  const rows: Exchange[] = [
    ...gifts.map((g): Exchange => ({
      kind: "gift", id: g.id, at: g.createdAt, fromId: g.senderId, toId: g.recipientId, giftKind: g.kind, card: card(g.cardId), zeni: g.zeniSpent,
    })),
    ...auctions.flatMap((x): Exchange[] =>
      x.currentBidderId
        ? [{ kind: "auction", id: x.id, at: x.settledAt ?? x.endsAt, fromId: x.sellerId, toId: x.currentBidderId, card: card(x.cardId), zeni: x.finalPrice ?? x.currentBid ?? x.price }]
        : [],
    ),
    ...orders.flatMap((x): Exchange[] =>
      x.sellerId ? [{ kind: "buyOrder", id: x.id, at: x.filledAt ?? x.createdAt, fromId: x.sellerId, toId: x.buyerId, card: card(x.cardId), zeni: x.price }] : [],
    ),
    ...flips.flatMap((f): Exchange[] => {
      if (!f.opponentId || !f.winnerId) return [];
      const creatorWon = f.winnerId === f.creatorId;
      return [{
        kind: "flip",
        id: f.id,
        at: f.resolvedAt ?? f.createdAt,
        fromId: creatorWon ? f.opponentId : f.creatorId,
        toId: f.winnerId,
        card: card(creatorWon ? f.opponentCardId : f.creatorCardId),
        kept: card(creatorWon ? f.creatorCardId : f.opponentCardId),
      }];
    }),
    // Le proposant donne la carte choisie par l'ami et reçoit la carte demandée
    ...trades.map((t): Exchange => ({
      kind: "trade", id: t.id, at: t.resolvedAt ?? t.createdAt, fromId: t.proposerId, toId: t.recipientId, given: card(t.chosenCardId), received: card(t.wantedCardId),
    })),
    // L'auteur de l'annonce donne sa carte et reçoit celle de l'offre
    ...offers.map((o): Exchange => ({
      kind: "listing", id: o.id, at: o.resolvedAt ?? o.createdAt, fromId: o.listing.ownerId, toId: o.bidderId, given: card(o.listing.cardId), received: card(o.cardId),
    })),
  ];
  const truncated = [gifts, auctions, orders, flips, trades, offers].some((list) => list.length >= PER_SOURCE);
  return { rows: sortExchanges(rows), truncated };
}

