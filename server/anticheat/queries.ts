import "server-only";
import { detectClusters, scorePairs, type DetectionInput, type SuspectCluster, type SuspectPair, type TransferKind } from "@/lib/anticheat/score";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Lectures de /admin/multi-comptes et de la fiche joueur. Les données brutes (IP, e-mails) sortent d'ici
// en clair : la page les masque pour le DEV avant le rendu (lib/anticheat/mask.ts).

export type DetectionOptions = { includeGuests: boolean };

async function loadDetection({ includeGuests }: DetectionOptions): Promise<DetectionInput> {
  const [sharedCap, minScore, users, signals, referrals, onlyFriends, transfers] = await Promise.all([
    getSetting("multiAccount.sharedIpCap"),
    getSetting("multiAccount.minScore"),
    prisma.user.findMany({
      where: { anonymizedAt: null, ...(includeGuests ? {} : { isGuest: false }) },
      select: { id: true, username: true, email: true, createdAt: true },
    }),
    prisma.userSignal.findMany({ select: { userId: true, kind: true, value: true } }),
    prisma.referral.findMany({ select: { referrerId: true, refereeId: true } }),
    // Joueurs qui n'ont qu'un seul ami accepté
    prisma.$queryRaw<{ userId: string; friendId: string }[]>`
      WITH f AS (
        SELECT "requesterId" AS u, "addresseeId" AS v FROM "Friendship" WHERE status = 'ACCEPTED'
        UNION ALL
        SELECT "addresseeId", "requesterId" FROM "Friendship" WHERE status = 'ACCEPTED'
      )
      SELECT u AS "userId", MIN(v) AS "friendId" FROM f GROUP BY u HAVING COUNT(*) = 1`,
    // Transferts entre joueurs, agrégés par sens : cadeaux, ventes conclues, pile ou face (du perdant au gagnant), échanges
    prisma.$queryRaw<{ fromId: string; toId: string; kind: TransferKind; count: number }[]>`
      SELECT "senderId" AS "fromId", "recipientId" AS "toId", 'gift' AS kind, COUNT(*)::int AS count
        FROM "Gift" GROUP BY 1, 2
      UNION ALL
      SELECT "sellerId", "currentBidderId", 'sale', COUNT(*)::int
        FROM "Auction" WHERE status = 'SOLD' AND "currentBidderId" IS NOT NULL GROUP BY 1, 2
      UNION ALL
      SELECT "sellerId", "buyerId", 'sale', COUNT(*)::int
        FROM "BuyOrder" WHERE status = 'FILLED' AND "sellerId" IS NOT NULL GROUP BY 1, 2
      UNION ALL
      SELECT CASE WHEN "winnerId" = "creatorId" THEN "opponentId" ELSE "creatorId" END, "winnerId", 'flip', COUNT(*)::int
        FROM "CoinFlip" WHERE status = 'DONE' AND "winnerId" IS NOT NULL AND "opponentId" IS NOT NULL GROUP BY 1, 2
      UNION ALL
      SELECT "proposerId", "recipientId", 'swap', COUNT(*)::int
        FROM "Trade" WHERE status = 'ACCEPTED' GROUP BY 1, 2
      UNION ALL
      SELECT l."ownerId", o."bidderId", 'swap', COUNT(*)::int
        FROM "ListingOffer" o JOIN "TradeListing" l ON l.id = o."listingId" WHERE o.status = 'ACCEPTED' GROUP BY 1, 2`,
  ]);
  return { users, signals, referrals, onlyFriends, transfers, sharedCap, minScore };
}

export type MemberInfo = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isGuest: boolean;
  banned: boolean;
  discordLinked: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  coins: number;
  cards: number;
};

/** Fiche courte de ces comptes (pseudo, rôle, ban, Discord…), pour les puces d'indices et les tableaux de membres. */
export async function membersById(ids: string[]): Promise<Map<string, MemberInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isGuest: true,
      bannedAt: true,
      discordLinkedAt: true,
      createdAt: true,
      lastSeenAt: true,
      coins: true,
      _count: { select: { cards: true } },
    },
  });
  return new Map(
    rows.map((u) => [
      u.id,
      {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        isGuest: u.isGuest,
        banned: u.bannedAt !== null,
        discordLinked: u.discordLinkedAt !== null,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        coins: u.coins,
        cards: u._count.cards,
      },
    ]),
  );
}

/** Groupes suspects avec la fiche courte de chaque membre. */
export async function suspectClusters(options: DetectionOptions): Promise<{ clusters: SuspectCluster[]; members: Map<string, MemberInfo>; minScore: number }> {
  const input = await loadDetection(options);
  const clusters = detectClusters(input);
  const members = await membersById([...new Set(clusters.flatMap((c) => c.userIds))]);
  return { clusters, members, minScore: input.minScore };
}

/** Comptes reliés à ce joueur (même sous le seuil), invités compris. */
export async function linkedAccountsFor(userId: string): Promise<{ pairs: SuspectPair[]; members: Map<string, MemberInfo>; minScore: number }> {
  const input = await loadDetection({ includeGuests: true });
  const pairs = scorePairs(input).filter((p) => p.a === userId || p.b === userId);
  const members = await membersById([...new Set(pairs.flatMap((p) => [p.a, p.b]))]);
  return { pairs, members, minScore: input.minScore };
}

export type SignalRow = {
  kind: "IP" | "DEVICE";
  value: string;
  firstEvent: "SIGNUP" | "REGISTER" | "LOGIN" | "DISCORD" | "SEEN";
  firstSeenAt: Date;
  lastSeenAt: Date;
  hits: number;
  others: { id: string; username: string }[];
  otherCount: number;
};

/** IP et appareils de ce joueur, avec les autres comptes qui les partagent (5 au plus par ligne). */
export async function signalsFor(userId: string): Promise<SignalRow[]> {
  const own = await prisma.userSignal.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    select: { kind: true, value: true, firstEvent: true, firstSeenAt: true, lastSeenAt: true, hits: true },
  });
  if (own.length === 0) return [];
  const shared = await prisma.userSignal.findMany({
    where: { userId: { not: userId }, OR: own.map((s) => ({ kind: s.kind, value: s.value })) },
    orderBy: { lastSeenAt: "desc" },
    select: { kind: true, value: true, user: { select: { id: true, username: true } } },
  });
  return own.map((s) => {
    const others = shared.filter((o) => o.kind === s.kind && o.value === s.value).map((o) => o.user);
    return { ...s, others: others.slice(0, 5), otherCount: others.length };
  });
}

export type SharedIp = { value: string; accounts: number; usernames: { id: string; username: string }[] };

/** IP partagées par plusieurs comptes, les plus partagées d'abord (`prefix` : recherche de l'admin). */
export async function sharedIps(options: { prefix?: string; take: number }): Promise<SharedIp[]> {
  const prefix = options.prefix ? `${options.prefix}%` : "%";
  const minAccounts = options.prefix ? 1 : 2;
  const rows = await prisma.$queryRaw<{ value: string; accounts: number; ids: string[] }[]>`
    SELECT value, COUNT(DISTINCT "userId")::int AS accounts, (array_agg(DISTINCT "userId"))[1:8] AS ids
    FROM "UserSignal"
    WHERE kind = 'IP' AND value LIKE ${prefix}
    GROUP BY value
    HAVING COUNT(DISTINCT "userId") >= ${minAccounts}
    ORDER BY accounts DESC, value
    LIMIT ${options.take}`;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => r.ids))] } },
    select: { id: true, username: true },
  });
  const names = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    value: r.value,
    accounts: r.accounts,
    usernames: r.ids.flatMap((id) => names.get(id) ?? []),
  }));
}
