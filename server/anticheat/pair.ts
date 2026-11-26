import { ipBanKey } from "@/lib/anticheat/network";
import type { TransferKind } from "@/lib/anticheat/score";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import type { PairScoreInput } from "@/lib/referral/hold";
import type { Tx } from "../social/lock";
import { accountsOnKeys, keyId } from "./network-ban-core";

// Indices d'une seule paire de comptes (parrain et filleul), avec les mêmes sources que la détection des multi-comptes
// (server/anticheat/queries.ts) : signaux d'appareil et d'IP, transferts agrégés par sens, barème `scoring`
// (multiAccount.scoring, lu par l'appelant). Les IP se comparent par leur clé de ban (une IPv6 par son /64, comme
// lib/anticheat/score.ts) ; celles vues sur plus de `sharedCap` comptes de tout le serveur (box d'un lycée, opérateur
// mobile, wifi public en IPv6) sont retirées : elles ne relient personne. Une valeur qui n'est pas une IP non plus.

export async function loadPairInput(db: Tx, referrerId: string, refereeId: string, sharedCap: number, scoring?: DetectionScoring): Promise<PairScoreInput | null> {
  const ids = [referrerId, refereeId];
  const [users, own, transfers] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, email: true, createdAt: true } }),
    db.userSignal.findMany({ where: { userId: { in: ids } }, select: { userId: true, kind: true, value: true } }),
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

  // Comptes de tout le serveur sur chaque clé d'IP de la paire (relevés de toutes les adresses d'un même /64)
  const ipKeys = [...new Set(own.flatMap((s) => (s.kind === "IP" ? (ipBanKey(s.value) ?? []) : [])))];
  const onKeys = await accountsOnKeys(db, ipKeys.map((key) => ({ kind: "IP" as const, key })));
  const accounts = (key: string) => onKeys.get(keyId("IP", key))?.length ?? 0;
  const signals = own.filter((s) => {
    if (s.kind === "DEVICE") return true;
    const key = ipBanKey(s.value);
    return key !== null && accounts(key) <= sharedCap;
  });
  return { referrer, referee, signals, transfers, sharedCap, scoring };
}
