// Lecture des données d'un joueur pour « Télécharger mes données ». Chaque requête choisit ses champs ;
// lib/account/export.ts filtre encore par liste blanche avant d'écrire le fichier.
import type { PrismaClient } from "@/generated/prisma/client";
import { buildDataExport, type ExportInput } from "@/lib/account/export";

export async function collectExportWith(db: PrismaClient, userId: string, now: Date) {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      emailVerified: true,
      image: true,
      isGuest: true,
      locale: true,
      coins: true,
      boosterStock: true,
      rankPoints: true,
      role: true,
      profileVisibility: true,
      showCollection: true,
      referralCode: true,
      termsVersion: true,
      discordLinkedAt: true,
      discordJoinedAt: true,
      deletionRequestedAt: true,
      createdAt: true,
    },
  });
  if (!profile) return null;

  const [
    accounts,
    cards,
    discoveries,
    wishlist,
    showcase,
    credits,
    openings,
    ledger,
    battles,
    auctions,
    bids,
    friendships,
    blocks,
    gifts,
    missions,
    purchases,
    referrals,
    seasons,
    review,
    notifications,
    pushSubs,
    requests,
  ] = await Promise.all([
    db.account.findMany({ where: { userId }, select: { provider: true, providerAccountId: true } }),
    db.userCard.findMany({
      where: { ownerId: userId },
      orderBy: { obtainedAt: "asc" },
      select: { id: true, cardId: true, status: true, obtainedAt: true, card: { select: { name: true, rarity: true } } },
    }),
    db.discovery.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { cardId: true, createdAt: true, card: { select: { name: true } } },
    }),
    db.wishlistEntry.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { cardId: true, position: true, createdAt: true } }),
    db.showcaseSlot.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { position: true, userCardId: true } }),
    db.boosterCredit.findMany({ where: { userId }, select: { boosterTypeId: true, count: true } }),
    db.boosterOpening.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, boosterSlug: true, catalogCardIds: true, golden: true, divine: true, pityTriggered: true, zeniSpent: true, createdAt: true },
    }),
    db.coinTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { amount: true, reason: true, refId: true, balanceAfter: true, createdAt: true },
    }),
    db.battle.findMany({
      where: { OR: [{ p1Id: userId }, { p2Id: userId }] },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        mode: true,
        status: true,
        p1Id: true,
        winnerSide: true,
        endReason: true,
        rewardZeni: true,
        pcDeltaP1: true,
        pcDeltaP2: true,
        botName: true,
        createdAt: true,
        endedAt: true,
        p1: { select: { username: true } },
        p2: { select: { username: true } },
      },
    }),
    db.auction.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, cardId: true, startPrice: true, buyoutPrice: true, finalPrice: true, fee: true, status: true, createdAt: true, endsAt: true },
    }),
    db.bid.findMany({ where: { bidderId: userId }, orderBy: { createdAt: "asc" }, select: { auctionId: true, amount: true, createdAt: true } }),
    db.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: {
        requesterId: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        requester: { select: { username: true } },
        addressee: { select: { username: true } },
      },
    }),
    db.userBlock.findMany({ where: { blockerId: userId }, select: { createdAt: true, blocked: { select: { username: true } } } }),
    db.gift.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: "asc" },
      select: {
        senderId: true,
        kind: true,
        cardId: true,
        zeniSpent: true,
        createdAt: true,
        sender: { select: { username: true } },
        recipient: { select: { username: true } },
      },
    }),
    db.userMission.findMany({ where: { userId }, orderBy: { claimedAt: "asc" }, select: { missionId: true, periodKey: true, claimedAt: true } }),
    db.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { shopItemId: true, currency: true, amount: true, status: true, createdAt: true, paidAt: true },
    }),
    db.referral.findMany({
      where: { OR: [{ referrerId: userId }, { refereeId: userId }] },
      select: { referrerId: true, status: true, createdAt: true, qualifiedAt: true },
    }),
    db.seasonResult.findMany({
      where: { userId },
      select: { seasonId: true, finalPc: true, peakPc: true, peakTier: true, games: true, claimedAt: true },
    }),
    db.review.findUnique({
      where: { userId },
      select: { rating: true, body: true, reply: true, hidden: true, createdAt: true, updatedAt: true },
    }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { type: true, refId: true, readAt: true, createdAt: true },
    }),
    db.pushSubscription.findMany({ where: { userId }, select: { endpoint: true, createdAt: true, lastSentAt: true } }),
    db.dataRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: "asc" },
      select: { kind: true, status: true, requestedAt: true, dueAt: true, processedAt: true },
    }),
  ]);

  const input: ExportInput = {
    profile,
    linkedAccounts: accounts,
    cards: cards.map((c) => ({ id: c.id, cardId: c.cardId, cardName: c.card.name, rarity: c.card.rarity, status: c.status, obtainedAt: c.obtainedAt })),
    discoveries: discoveries.map((d) => ({ cardId: d.cardId, cardName: d.card.name, createdAt: d.createdAt })),
    wishlist,
    showcase,
    boosterCredits: credits,
    openings,
    ledger,
    battles: battles.map((b) => {
      const side = b.p1Id === userId ? 0 : 1;
      return {
        id: b.id,
        mode: b.mode,
        status: b.status,
        side,
        opponent: side === 0 ? (b.p2?.username ?? b.botName) : b.p1.username,
        won: b.winnerSide === null ? null : b.winnerSide === side,
        endReason: b.endReason,
        rewardZeni: b.winnerSide === side ? b.rewardZeni : 0,
        pcDelta: side === 0 ? b.pcDeltaP1 : b.pcDeltaP2,
        createdAt: b.createdAt,
        endedAt: b.endedAt,
      };
    }),
    auctions,
    bids,
    friends: friendships.map((f) => {
      const outgoing = f.requesterId === userId;
      return {
        username: outgoing ? f.addressee.username : f.requester.username,
        status: f.status,
        direction: outgoing ? "OUTGOING" : "INCOMING",
        createdAt: f.createdAt,
        acceptedAt: f.acceptedAt,
      };
    }),
    blocked: blocks.map((b) => ({ username: b.blocked.username, createdAt: b.createdAt })),
    gifts: gifts.map((g) => {
      const sent = g.senderId === userId;
      return {
        direction: sent ? "SENT" : "RECEIVED",
        kind: g.kind,
        cardId: g.cardId,
        zeniSpent: sent ? g.zeniSpent : 0,
        otherUsername: sent ? g.recipient.username : g.sender.username,
        createdAt: g.createdAt,
      };
    }),
    missions,
    purchases,
    referrals: referrals.map((r) => ({
      role: r.referrerId === userId ? "REFERRER" : "REFEREE",
      status: r.status,
      createdAt: r.createdAt,
      qualifiedAt: r.qualifiedAt,
    })),
    seasons,
    review,
    notifications,
    pushSubscriptions: pushSubs,
    dataRequests: requests,
  };
  return buildDataExport(input, now);
}
