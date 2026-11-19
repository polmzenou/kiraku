import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BuyOrderRules } from "@/lib/market/buy-orders";
import type { CardView } from "@/lib/boosters/view";
import { ORDINARY_COPY } from "@/lib/collection/copies";
import { cardViews } from "../boosters/display";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Lectures des avis de recherche. Un avis échu est masqué dès son échéance (le cron le ferme et
// rembourse ensuite) ; les avis d'un acheteur banni ou en cours de suppression ne sont pas proposés.

export const ORDERS_PAGE = 24;

export async function getBuyOrderRules(): Promise<BuyOrderRules> {
  const [enabled, durationDays, maxOpen] = await Promise.all([
    getSetting("market.ordersEnabled"),
    getSetting("market.orderDurationDays"),
    getSetting("market.maxOpenOrders"),
  ]);
  return { enabled, durationDays, maxOpen };
}

/** Avis vendables à `now` : ouverts, pas échus, acheteur en règle. */
const sellable = (now: Date): Prisma.BuyOrderWhereInput => ({
  status: "OPEN",
  expiresAt: { gt: now },
  buyer: { bannedAt: null, deletionRequestedAt: null, anonymizedAt: null },
});

/** Priorité prix puis ancienneté (lib/market/buy-orders.ts, compareOrders). */
const bestFirst: Prisma.BuyOrderOrderByWithRelationInput[] = [{ price: "desc" }, { createdAt: "asc" }, { id: "asc" }];

const orderSelect = {
  id: true,
  cardId: true,
  price: true,
  feeBp: true,
  expiresAt: true,
  createdAt: true,
  buyerId: true,
  buyer: { select: namedPlayerSelect },
} as const;

export type OrderView = {
  id: string;
  cardId: string;
  price: number;
  feeBp: number;
  expiresAt: Date;
  /** null : profil caché à ce visiteur (« Un joueur »). */
  buyerName: string | null;
  mine: boolean;
};

async function toViews(rows: Prisma.BuyOrderGetPayload<{ select: typeof orderSelect }>[], viewerId: string | null): Promise<OrderView[]> {
  const nameOf = await publicNamesFor(viewerId, rows.map((r) => r.buyer));
  return rows.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    price: r.price,
    feeBp: r.feeBp,
    expiresAt: r.expiresAt,
    buyerName: nameOf(r.buyer).name,
    mine: r.buyerId === viewerId,
  }));
}

export type CardOrders = {
  /** Meilleures offres des autres joueurs, la plus haute d'abord. */
  best: OrderView[];
  /** Nombre total d'avis ouverts sur la carte. */
  total: number;
  /** Avis du visiteur sur cette carte. */
  mine: OrderView[];
  /** Exemplaires du visiteur vendables (en collection). */
  freeCopies: number;
};

/** Avis de recherche d'une carte, vus par `viewerId` (fiche wiki et fiche de collection). */
export async function cardOrders(cardId: string, viewerId: string | null, now = new Date(), limit = 5): Promise<CardOrders> {
  const where = { ...sellable(now), cardId };
  const [best, total, mine, freeCopies] = await Promise.all([
    prisma.buyOrder.findMany({ where: viewerId ? { ...where, buyerId: { not: viewerId } } : where, orderBy: bestFirst, take: limit, select: orderSelect }),
    prisma.buyOrder.count({ where }),
    viewerId ? prisma.buyOrder.findMany({ where: { cardId, buyerId: viewerId, status: "OPEN", expiresAt: { gt: now } }, orderBy: bestFirst, select: orderSelect }) : [],
    // Exemplaires qu'un avis peut prendre : les ordinaires (une pièce spéciale ne part jamais par un avis)
    viewerId ? prisma.userCard.count({ where: { ownerId: viewerId, cardId, status: "COLLECTION", ...ORDINARY_COPY } }) : 0,
  ]);
  const [bestViews, mineViews] = await Promise.all([toViews(best, viewerId), toViews(mine, viewerId)]);
  return { best: bestViews, total, mine: mineViews, freeCopies };
}

export type OrderWithCard = OrderView & { card: CardView };

async function withCards(orders: OrderView[], locale: string): Promise<OrderWithCard[]> {
  const views = await cardViews([...new Set(orders.map((o) => o.cardId))], locale);
  return orders.flatMap((o) => {
    const card = views.get(o.cardId);
    return card ? [{ ...o, card }] : [];
  });
}

/**
 * « Tu as ce qu'ils cherchent » : la meilleure offre de chaque carte dont le joueur a un exemplaire
 * vendable, hors ses propres avis, les plus hautes d'abord.
 */
export async function ordersYouCanFill(userId: string, locale: string, now = new Date(), limit = 24): Promise<OrderWithCard[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (o."cardId") o.id, o.price
    FROM "BuyOrder" o
    JOIN "User" b ON b.id = o."buyerId"
    WHERE o.status = 'OPEN' AND o."expiresAt" > ${now} AND o."buyerId" <> ${userId}
      AND b."bannedAt" IS NULL AND b."deletionRequestedAt" IS NULL AND b."anonymizedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."ownerId" = ${userId} AND uc."cardId" = o."cardId" AND uc.status = 'COLLECTION'
                  AND uc.heritage = 0 AND uc.printing IS NULL)
    ORDER BY o."cardId", o.price DESC, o."createdAt" ASC, o.id ASC`;
  if (rows.length === 0) return [];
  const orders = await prisma.buyOrder.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: bestFirst, take: limit, select: orderSelect });
  return withCards(await toViews(orders, userId), locale);
}

/** Avis ouverts du joueur, puis ses derniers avis clos. */
export async function myOrders(userId: string, locale: string, now = new Date()) {
  const [open, closed] = await Promise.all([
    prisma.buyOrder.findMany({ where: { buyerId: userId, status: "OPEN", expiresAt: { gt: now } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: orderSelect }),
    prisma.buyOrder.findMany({
      where: { buyerId: userId, OR: [{ status: { not: "OPEN" } }, { expiresAt: { lte: now } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { ...orderSelect, status: true, filledAt: true },
    }),
  ]);
  const [openViews, closedViews] = await Promise.all([withCards(await toViews(open, userId), locale), withCards(await toViews(closed, userId), locale)]);
  const statusById = new Map(closed.map((c) => [c.id, c.status === "OPEN" ? ("EXPIRED" as const) : c.status]));
  return { open: openViews, closed: closedViews.map((o) => ({ ...o, status: statusById.get(o.id) ?? "EXPIRED" })) };
}

/** Tous les avis ouverts du marché (filtre de rareté), les plus hauts ou les plus récents d'abord. */
export async function openOrdersBoard(input: { viewerId: string | null; locale: string; rarity: string | null; sort: "price" | "newest"; page: number; now?: Date }) {
  const now = input.now ?? new Date();
  const page = Math.max(0, Math.min(200, Math.trunc(input.page)));
  const rows = await prisma.buyOrder.findMany({
    where: { ...sellable(now), ...(input.rarity && { card: { rarity: input.rarity } }) },
    orderBy: input.sort === "newest" ? [{ createdAt: "desc" }, { id: "desc" }] : bestFirst,
    skip: page * ORDERS_PAGE,
    take: ORDERS_PAGE + 1,
    select: orderSelect,
  });
  const items = await withCards(await toViews(rows.slice(0, ORDERS_PAGE), input.viewerId), input.locale);
  return { items, hasMore: rows.length > ORDERS_PAGE };
}

/** Avis ouverts et Zeni en séquestre (admin). */
export async function orderTotals(now: Date) {
  const open = await prisma.buyOrder.aggregate({ where: { status: "OPEN" }, _count: true, _sum: { price: true } });
  const due = await prisma.buyOrder.count({ where: { status: "OPEN", expiresAt: { lte: now } } });
  return { open: open._count, escrow: open._sum.price ?? 0, due };
}
