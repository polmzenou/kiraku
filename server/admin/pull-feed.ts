import "server-only";
import { isPermanentBlock } from "@/lib/home/pull-feed-block";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import { feedPullIds, feedQuery } from "../home/pulls";

// Module /admin/gros-tirages : joueurs retirés du carrousel et fil tel que les joueurs le voient.

export type PullFeedBlockRow = { userId: string; username: string; until: Date; permanent: boolean };

/** Joueurs retirés du carrousel en ce moment, les retraits les plus longs d'abord. */
export async function getPullFeedBlocklist(now = new Date()): Promise<PullFeedBlockRow[]> {
  const rows = await prisma.user.findMany({
    where: { pullFeedHiddenUntil: { gt: now } },
    orderBy: [{ pullFeedHiddenUntil: "desc" }, { username: "asc" }],
    take: 200,
    select: { id: true, username: true, pullFeedHiddenUntil: true },
  });
  return rows.map((r) => ({ userId: r.id, username: r.username, until: r.pullFeedHiddenUntil!, permanent: isPermanentBlock(r.pullFeedHiddenUntil!) }));
}

export type PullFeedPreviewRow = { id: string; userId: string; username: string; cardName: string; rarity: string; at: Date };

/** Fil actuel, sans cache : mêmes filtres que l'accueil (rareté, ancienneté, blacklist, max par joueur). */
export async function getPullFeedPreview(locale: string): Promise<PullFeedPreviewRow[]> {
  const ids = await feedPullIds(await feedQuery());
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = (await prisma.notablePull.findMany({
    where: { id: { in: ids } },
    select: { id: true, cardId: true, rarity: true, createdAt: true, user: { select: { id: true, username: true } } },
  })).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const views = await cardViews(rows.map((r) => r.cardId), locale);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user.id,
    username: r.user.username,
    cardName: views.get(r.cardId)?.name ?? r.cardId,
    rarity: r.rarity,
    at: r.createdAt,
  }));
}
