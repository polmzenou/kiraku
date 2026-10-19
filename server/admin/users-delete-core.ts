// Suppression définitive d'un compte depuis /admin. Client injecté (serveur ou test de concurrence).
//
// Avant le DELETE (les relations du joueur partent en cascade), on rend aux autres joueurs ce que
// le compte bloquait :
// - ses ventes en cours sont annulées et la mise en tête rendue au meneur (BID_REFUND) ;
// - les ventes qu'il menait reviennent sans meneur (sa mise en séquestre part avec son solde) ;
// - les cartes engagées par un adversaire dans un combat en cours avec lui reviennent en collection.
//
// Ordre des verrous, comme l'hôtel des ventes : les ventes d'abord, puis les joueurs triés par id.
import type { PrismaClient } from "@/generated/prisma/client";
import { credit } from "../economy/ledger";
import { lockPlayers } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { writeAdminLog } from "./log";

export type UserDeleteErrorCode = "FORBIDDEN" | "NOT_FOUND" | "SELF_PROTECTED" | "ADMIN_PROTECTED" | "HAS_ADMIN_HISTORY";

export class UserDeleteError extends Error {
  constructor(readonly code: UserDeleteErrorCode) {
    super(code);
  }
}

type LockedAuction = {
  id: string;
  sellerId: string;
  cardId: string;
  startPrice: number;
  currentBid: number | null;
  currentBidderId: string | null;
};

const TX = { maxWait: 10_000, timeout: 30_000 };

export async function deleteUserWith(
  db: PrismaClient,
  input: { adminId: string; userId: string; reason: string; now?: Date },
  onNotified?: OnNotified,
) {
  const now = input.now ?? new Date();
  if (input.userId === input.adminId) throw new UserDeleteError("SELF_PROTECTED");

  return notifyingTransaction(
    db,
    async (tx) => {
      // 1. Ventes touchées par le compte (vendeur ou meneur), verrouillées avant les joueurs
      const auctions = await tx.$queryRaw<LockedAuction[]>`
        SELECT id, "sellerId", "cardId", "startPrice", "currentBid", "currentBidderId"
        FROM "Auction"
        WHERE status = 'ACTIVE' AND ("sellerId" = ${input.userId} OR "currentBidderId" = ${input.userId})
        ORDER BY id
        FOR UPDATE`;
      const refunded = auctions.filter((a) => a.sellerId === input.userId && a.currentBidderId && a.currentBid !== null);

      // 2. Joueurs : l'admin, le compte, et chaque meneur à rembourser
      await lockPlayers(tx, [input.adminId, input.userId, ...refunded.map((a) => a.currentBidderId!)]);
      const actor = await tx.user.findUnique({ where: { id: input.adminId }, select: { role: true, bannedAt: true } });
      if (!actor || actor.role !== "ADMIN" || actor.bannedAt) throw new UserDeleteError("FORBIDDEN");
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isGuest: true,
          coins: true,
          createdAt: true,
          _count: { select: { cards: true, adminLogs: true, lotGrantsGiven: true, lotBroadcasts: true } },
        },
      });
      if (!user) throw new UserDeleteError("NOT_FOUND");
      if (user.role === "ADMIN") throw new UserDeleteError("ADMIN_PROTECTED");
      // Un ancien admin garde son journal : ses actions passées doivent rester attribuées
      if (user._count.adminLogs + user._count.lotGrantsGiven + user._count.lotBroadcasts > 0) {
        throw new UserDeleteError("HAS_ADMIN_HISTORY");
      }

      for (const a of auctions) {
        if (a.sellerId === input.userId) {
          await tx.auction.update({
            where: { id: a.id },
            data: { status: "CANCELLED", cancelledAt: now, cancelledById: input.adminId },
          });
          if (a.currentBidderId && a.currentBid !== null) {
            await credit(tx, { userId: a.currentBidderId, amount: a.currentBid, reason: "BID_REFUND", refId: a.id, now });
            await notify(tx, {
              userId: a.currentBidderId,
              type: "AUCTION_CANCELLED",
              actorId: a.currentBidderId,
              refId: a.id,
              payload: { auctionId: a.id, cardId: a.cardId, amount: a.currentBid },
              now,
            });
          }
        } else {
          // Le compte menait : la vente repart sans meneur, au prix de départ
          await tx.auction.update({
            where: { id: a.id },
            data: { currentBid: null, currentBidderId: null, price: a.startPrice },
          });
        }
      }

      // Ventes closes qu'il a remportées : la contrainte « mise ⇔ meneur » interdit de ne vider
      // que le meneur (SET NULL) ; le prix final reste dans finalPrice
      await tx.auction.updateMany({
        where: { currentBidderId: input.userId, status: { not: "ACTIVE" } },
        data: { currentBid: null, currentBidderId: null },
      });

      // 3. Combats en cours avec un autre joueur : ses cartes engagées reviennent en collection
      const battles = await tx.battle.findMany({
        where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ p1Id: input.userId }, { p2Id: input.userId }] },
        select: { p1Id: true, p2Id: true, p1Team: true, p2Team: true },
      });
      for (const b of battles) {
        const opponent = b.p1Id === input.userId ? b.p2Id : b.p1Id;
        const team = b.p1Id === input.userId ? b.p2Team : b.p1Team;
        if (!opponent || team.length === 0) continue;
        await tx.userCard.updateMany({
          where: { id: { in: team }, ownerId: opponent, status: "BATTLE" },
          data: { status: "COLLECTION" },
        });
      }

      await writeAdminLog(tx, {
        adminId: input.adminId,
        action: "USER_DELETE",
        targetType: "User",
        targetId: user.id,
        before: {
          username: user.username,
          email: user.email,
          isGuest: user.isGuest,
          coins: user.coins,
          cards: user._count.cards,
          createdAt: user.createdAt.toISOString(),
        },
        after: { deleted: true, reason: input.reason, auctionsCancelled: auctions.filter((a) => a.sellerId === input.userId).length },
      });
      await tx.user.delete({ where: { id: user.id }, select: { id: true } });
      return { username: user.username };
    },
    TX,
    onNotified,
  );
}
