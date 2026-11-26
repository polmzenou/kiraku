import "server-only";
import { auctionMessage, tradeListingMessage } from "@/lib/discord/market-message";
import { promisedCopyLeft } from "../collection/transfer";
import { prisma } from "../db";
import { appUrl, discordMarketConfigured, env } from "../env";
import { getSetting } from "../settings";
import { discordPaused } from "./api";
import { copyLabelOf, discordPlayerName, discordPlayerSelect } from "./labels";
import { dropDiscordPost, publishDiscordPost } from "./posts";

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
      id: true, status: true, startPrice: true, buyoutPrice: true, currentBid: true, finalPrice: true, endsAt: true, userCardId: true,
      seller: { select: discordPlayerSelect },
      card: { select: { name: true, imageUrl: true, spoiler: true, rarityDefinition: { select: { nameFr: true } }, series: { select: { titleRomaji: true } } } },
    },
  });
  if (!auction) return false;
  // Une offre déjà terminée avant son premier envoi n'encombre pas le salon.
  if (!post.messageId && post.attempts === 0 && (auction.status !== "ACTIVE" || auction.endsAt <= new Date())) {
    await dropDiscordPost(post.key);
    return false;
  }
  const payload = auctionMessage({
    ...auction,
    copy: await copyLabelOf(auction.userCardId),
    sellerName: discordPlayerName(auction.seller),
    card: { ...auction.card, rarityName: auction.card.rarityDefinition.nameFr, series: auction.card.series.titleRomaji },
  }, appUrl());
  return (await publishDiscordPost(post.key, payload, auctionRecheckAt(auction), false, { mentionRoleId: env.DISCORD_MERCHANT_ROLE_ID })).ok;
}

// Relecture de sécurité d'une annonce active : mises, achats, clôtures et annulations remettent déjà l'annonce en tête
// de file (touchDiscordPost, dans leur transaction). Ne changent sans événement que le passage à « Terminée » (à
// l'heure de fin), la disponibilité de la carte d'un échange et le nom affiché du joueur.
const RECHECK_MS = 5 * 60_000;
// Vente échue en attente de sa clôture (paresseuse ou par le cron du marché, qui remet l'annonce en tête de file)
const SETTLING_RECHECK_MS = 10 * 60_000;

function auctionRecheckAt(auction: { status: string; endsAt: Date }, now = Date.now()): Date | null {
  if (auction.status !== "ACTIVE") return null;
  const end = auction.endsAt.getTime();
  return new Date(end > now ? Math.min(end, now + RECHECK_MS) : now + SETTLING_RECHECK_MS);
}

/** Même file et même salon pour les annonces d'échange, sans prix ni achat immédiat. */
export async function syncDiscordListing(listingId: string): Promise<boolean> {
  if (!(await discordMarketChannel())) return false;
  const post = await prisma.discordPost.findUnique({ where: { listingId } });
  if (!post || !post.nextAttemptAt || post.nextAttemptAt > new Date()) return false;
  const listing = await prisma.tradeListing.findUnique({
    where: { id: listingId },
    select: {
      id: true, ownerId: true, cardId: true, userCardId: true, status: true, expiresAt: true,
      owner: { select: discordPlayerSelect },
      card: { select: { name: true, imageUrl: true, spoiler: true, rarityDefinition: { select: { nameFr: true } } } },
      wants: { orderBy: { cardId: "asc" }, select: { card: { select: { name: true, rarityDefinition: { select: { nameFr: true } } } } } },
    },
  });
  if (!listing) return false;
  const now = new Date();
  const open = listing.status === "OPEN" && listing.expiresAt > now;
  if (!post.messageId && post.attempts === 0 && !open) {
    await dropDiscordPost(post.key);
    return false;
  }
  // Même règle que l'acceptation : l'exemplaire épinglé, sinon un ordinaire
  const available = open && await promisedCopyLeft(prisma, listing);
  const payload = tradeListingMessage({
    ...listing,
    available,
    copy: await copyLabelOf(listing.userCardId),
    ownerName: discordPlayerName(listing.owner),
    card: { ...listing.card, rarityName: listing.card.rarityDefinition.nameFr },
    wants: listing.wants.map(({ card }) => ({ name: card.name, rarityName: card.rarityDefinition.nameFr })),
  }, appUrl(), now);
  const next = open ? new Date(Math.min(listing.expiresAt.getTime(), Date.now() + RECHECK_MS)) : null;
  return (await publishDiscordPost(post.key, payload, next, false, { mentionRoleId: env.DISCORD_MERCHANT_ROLE_ID })).ok;
}

/** Lot borné pour le cron ; les instances concurrentes se partagent les leases de publication. */
export async function syncDiscordMarket(deadline = Date.now() + 35_000): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 };
  if (!(await discordMarketChannel())) return result;
  const posts = await prisma.discordPost.findMany({
    where: { nextAttemptAt: { lte: new Date() }, AND: [
      { OR: [{ auctionId: { not: null } }, { listingId: { not: null } }] },
      { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
    ] },
    orderBy: { nextAttemptAt: "asc" }, take: 20, select: { auctionId: true, listingId: true },
  });
  for (const post of posts) {
    if (Date.now() + 15_000 > deadline || discordPaused()) break;
    try {
      if (await (post.auctionId ? syncDiscordAuction(post.auctionId) : syncDiscordListing(post.listingId!))) result.synced++;
      else result.failed++;
    } catch {
      result.failed++;
      console.warn("[discord] synchronisation d’une annonce reportée.");
    }
  }
  return result;
}
