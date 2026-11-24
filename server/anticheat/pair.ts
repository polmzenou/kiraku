import type { TransferKind } from "@/lib/anticheat/score";
import type { PairScoreInput } from "@/lib/referral/hold";
import type { Tx } from "../social/lock";

// Indices d'une seule paire de comptes (parrain et filleul), avec les mêmes sources que la détection des multi-comptes
// (server/anticheat/queries.ts) : signaux d'appareil et d'IP, transferts agrégés par sens. Les IP vues sur plus de
// `sharedCap` comptes de tout le serveur (box d'un lycée, opérateur mobile) sont retirées : elles ne relient personne.

export async function loadPairInput(db: Tx, referrerId: string, refereeId: string, sharedCap: number): Promise<PairScoreInput | null> {
  const ids = [referrerId, refereeId];
  const [users, signals, transfers] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, email: true, createdAt: true } }),
    db.$queryRaw<{ userId: string; kind: "IP" | "DEVICE"; value: string }[]>`
      SELECT s."userId", s.kind::text AS kind, s.value FROM "UserSignal" s
      WHERE s."userId" IN (${referrerId}, ${refereeId})
        AND (s.kind = 'DEVICE' OR (SELECT COUNT(DISTINCT o."userId") FROM "UserSignal" o WHERE o.kind = s.kind AND o.value = s.value) <= ${sharedCap})`,
    db.$queryRaw<{ fromId: string; toId: string; kind: TransferKind; count: number }[]>`
      SELECT * FROM (
        SELECT "senderId" AS "fromId", "recipientId" AS "toId", 'gift' AS kind, COUNT(*)::int AS count
          FROM "Gift" WHERE ("senderId", "recipientId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
        UNION ALL
        SELECT "sellerId", "currentBidderId", 'sale', COUNT(*)::int
          FROM "Auction" WHERE status = 'SOLD' AND ("sellerId", "currentBidderId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
        UNION ALL
        SELECT "sellerId", "buyerId", 'sale', COUNT(*)::int
          FROM "BuyOrder" WHERE status = 'FILLED' AND ("sellerId", "buyerId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
        UNION ALL
        SELECT CASE WHEN "winnerId" = "creatorId" THEN "opponentId" ELSE "creatorId" END, "winnerId", 'flip', COUNT(*)::int
          FROM "CoinFlip" WHERE status = 'DONE' AND "winnerId" IS NOT NULL AND ("creatorId", "opponentId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
        UNION ALL
        SELECT "proposerId", "recipientId", 'swap', COUNT(*)::int
          FROM "Trade" WHERE status = 'ACCEPTED' AND ("proposerId", "recipientId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
        UNION ALL
        SELECT l."ownerId", o."bidderId", 'swap', COUNT(*)::int
          FROM "ListingOffer" o JOIN "TradeListing" l ON l.id = o."listingId"
          WHERE o.status = 'ACCEPTED' AND (l."ownerId", o."bidderId") IN ((${referrerId}, ${refereeId}), (${refereeId}, ${referrerId})) GROUP BY 1, 2
      ) t`,
  ]);
  const referrer = users.find((u) => u.id === referrerId);
  const referee = users.find((u) => u.id === refereeId);
  if (!referrer || !referee) return null;
  return { referrer, referee, signals, transfers, sharedCap };
}
