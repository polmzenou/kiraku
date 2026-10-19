import "server-only";
import type { CardView, OpenedCardView } from "@/lib/boosters/view";
import { prisma } from "../db";
import { cardViews } from "../boosters/display";
import type { PlayerRef } from "./queries";

// Lectures des échanges d'un joueur (onglet « Échanges » de /amis).

const playerSelect = { id: true, username: true, image: true, isGuest: true } as const;
const HISTORY_SIZE = 20;

export type TradeView = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED" | "FAILED";
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
  proposer: PlayerRef;
  recipient: PlayerRef;
  wanted: CardView;
  offers: CardView[];
  chosen: CardView | null;
};

export type TradeLists = {
  received: TradeView[];
  sent: TradeView[];
  history: TradeView[];
  /** Cartes reçues par le proposant dont il n'a pas encore vu la révélation. */
  reveals: { tradeIds: string[]; cards: OpenedCardView[] };
};

const tradeSelect = {
  id: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  resolvedAt: true,
  wantedCardId: true,
  chosenCardId: true,
  proposerNew: true,
  proposerSeenAt: true,
  proposer: { select: playerSelect },
  recipient: { select: playerSelect },
  offers: { select: { cardId: true } },
} as const;

export async function listTrades(userId: string, locale: string, now = new Date()): Promise<TradeLists> {
  const [open, history] = await Promise.all([
    prisma.trade.findMany({
      where: { status: "PENDING", expiresAt: { gt: now }, OR: [{ proposerId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: tradeSelect,
    }),
    prisma.trade.findMany({
      where: { status: { not: "PENDING" }, OR: [{ proposerId: userId }, { recipientId: userId }] },
      orderBy: { resolvedAt: "desc" },
      take: HISTORY_SIZE,
      select: tradeSelect,
    }),
  ]);
  const rows = [...open, ...history];
  const views = await cardViews(
    rows.flatMap((r) => [r.wantedCardId, ...r.offers.map((o) => o.cardId), ...(r.chosenCardId ? [r.chosenCardId] : [])]),
    locale,
  );
  const toView = (r: (typeof rows)[number]): TradeView | null => {
    const wanted = views.get(r.wantedCardId);
    if (!wanted) return null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      resolvedAt: r.resolvedAt,
      proposer: r.proposer,
      recipient: r.recipient,
      wanted,
      offers: r.offers.flatMap((o) => views.get(o.cardId) ?? []),
      chosen: r.chosenCardId ? (views.get(r.chosenCardId) ?? null) : null,
    };
  };
  const unseen = history.filter((r) => r.status === "ACCEPTED" && r.proposer.id === userId && r.proposerSeenAt === null);

  return {
    received: open.filter((r) => r.recipient.id === userId).flatMap((r) => toView(r) ?? []),
    sent: open.filter((r) => r.proposer.id === userId).flatMap((r) => toView(r) ?? []),
    history: history.flatMap((r) => toView(r) ?? []),
    reveals: {
      tradeIds: unseen.map((r) => r.id),
      cards: unseen.flatMap((r) => {
        const view = views.get(r.wantedCardId);
        return view ? [{ ...view, userCardId: `trade-${r.id}`, isNew: r.proposerNew, featured: false }] : [];
      }),
    },
  };
}

/** Propositions reçues encore ouvertes (pastille de l'onglet). */
export function countIncomingTrades(userId: string, now = new Date()) {
  return prisma.trade.count({ where: { recipientId: userId, status: "PENDING", expiresAt: { gt: now } } });
}
