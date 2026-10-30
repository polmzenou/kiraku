import "server-only";
import { displayNameFor } from "@/lib/collection/display-name";
import { auctionMessage } from "@/lib/discord/market-message";
import { prisma } from "../db";
import { appUrl, discordMarketConfigured, env } from "../env";
import { getSetting } from "../settings";
import { publishDiscordPost } from "./posts";

export async function discordMarketChannel(): Promise<string | undefined> {
  return discordMarketConfigured && await getSetting("discord.marketEnabled") ? env.DISCORD_MARKET_CHANNEL_ID : undefined;
}

/** Relit toujours l'état validé en base. Aucun appel Discord dans une transaction de vente. */
export async function syncDiscordAuction(auctionId: string): Promise<boolean> {
  if (!(await discordMarketChannel())) return false;
  const post = await prisma.discordPost.findUnique({ where: { auctionId } });
  if (!post || !post.nextAttemptAt || post.nextAttemptAt > new Date()) return false;
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, startPrice: true, buyoutPrice: true, currentBid: true, finalPrice: true, endsAt: true,
      seller: { select: { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true } },
      card: { select: { name: true, imageUrl: true, rarityDefinition: { select: { nameFr: true } }, series: { select: { titleRomaji: true } } } },
    },
  });
  if (!auction) return false;
  // Une offre déjà terminée avant son premier envoi n'encombre pas le salon.
  if (!post.messageId && post.attempts === 0 && (auction.status !== "ACTIVE" || auction.endsAt <= new Date())) {
    await prisma.discordPost.updateMany({ where: { key: post.key, messageId: null }, data: { nextAttemptAt: null } });
    return false;
  }
  const payload = auctionMessage({
    ...auction,
    sellerName: displayNameFor(auction.seller, null, { friends: false, blocked: false }, { hidden: "Un joueur", deleted: "Compte supprimé" }),
    card: { ...auction.card, rarityName: auction.card.rarityDefinition.nameFr, series: auction.card.series.titleRomaji },
  }, appUrl());
  const next = auction.status === "ACTIVE" ? new Date(Date.now() + 60_000) : null;
  return (await publishDiscordPost(post.key, payload, next)).ok;
}

/** Lot borné pour le cron ; les instances concurrentes se partagent les leases de publication. */
export async function syncDiscordMarket(): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 };
  if (!(await discordMarketChannel())) return result;
  const started = Date.now();
  const posts = await prisma.discordPost.findMany({
    where: { auctionId: { not: null }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" }, take: 20, select: { auctionId: true },
  });
  for (const post of posts) {
    if (Date.now() - started > 35_000) break;
    try {
      if (await syncDiscordAuction(post.auctionId!)) result.synced++;
      else result.failed++;
    } catch {
      result.failed++;
      console.warn("[discord] synchronisation d’une annonce reportée.");
    }
  }
  return result;
}
