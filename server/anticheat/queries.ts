import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ipBanKey, ipKeyPatterns } from "@/lib/anticheat/network";
import { detectClusters, scorePairs, type DetectionInput, type SuspectCluster, type SuspectPair, type TransferKind } from "@/lib/anticheat/score";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Lectures de /admin/multi-comptes et de la fiche joueur. Les données brutes (IP, e-mails) sortent d'ici
// en clair : la page les masque pour le DEV avant le rendu (lib/anticheat/mask.ts).
//
// Les IP se comparent partout par leur clé de ban (lib/anticheat/network.ts) : l'IPv4 exacte, l'IPv6 par son /64.
// Les adresses temporaires d'un même foyer (une par appareil, renouvelée chaque jour) tombent ainsi sous une clé.

type DetectionOptions = { includeGuests: boolean };

type SignalKind = "IP" | "DEVICE";

/** Clé de comparaison d'un relevé : l'IP par sa clé de ban, en minuscules si ce n'est pas une IP ; l'appareil tel quel. */
const signalKey = (s: { kind: SignalKind; value: string }) => `${s.kind}:${s.kind === "IP" ? (ipBanKey(s.value) ?? s.value.toLowerCase()) : s.value}`;

/**
 * Relevés (de tous les comptes, ceux-là compris) qui partagent une clé avec ces relevés : appareil identique, IP de
 * même clé. Préfiltre SQL sur le début de l'adresse, en minuscules (ipKeyPatterns), puis comparaison exacte des clés.
 */
async function signalsSharing(own: readonly { kind: SignalKind; value: string }[]) {
  const devices = [...new Set(own.filter((s) => s.kind === "DEVICE").map((s) => s.value))];
  const patterns = [
    ...new Set(
      own
        .filter((s) => s.kind === "IP")
        .flatMap((s) => {
          const key = ipBanKey(s.value);
          // Valeur qui n'est pas une IP : comparée telle quelle (ni « % » ni « _ » : isRecordableIp)
          return key ? ipKeyPatterns(key) : [s.value.toLowerCase()];
        }),
    ),
  ];
  if (devices.length === 0 && patterns.length === 0) return [];
  const keys = new Set(own.map(signalKey));
  const rows = await prisma.$queryRaw<{ userId: string; kind: SignalKind; value: string; lastSeenAt: Date }[]>`
    SELECT "userId", kind::text AS kind, value, "lastSeenAt" FROM "UserSignal"
    WHERE (kind = 'DEVICE' AND value = ANY(${devices}::text[]))
       OR (kind = 'IP' AND lower(value) LIKE ANY(${patterns}::text[]))
    ORDER BY "lastSeenAt" DESC`;
  return rows.filter((r) => keys.has(signalKey(r)));
}

/**
 * Transferts entre joueurs, agrégés par sens : cadeaux, ventes conclues, pile ou face (du perdant au gagnant),
 * échanges. `around` : seulement ceux qui touchent ce joueur (fiche joueur).
 */
function loadTransfers(around: string | null) {
  const touching = (a: Prisma.Sql, b: Prisma.Sql) => (around ? Prisma.sql`AND (${a} = ${around} OR ${b} = ${around})` : Prisma.empty);
  return prisma.$queryRaw<{ fromId: string; toId: string; kind: TransferKind; count: number }[]>`
    SELECT "senderId" AS "fromId", "recipientId" AS "toId", 'gift' AS kind, COUNT(*)::int AS count
      FROM "Gift" WHERE TRUE ${touching(Prisma.sql`"senderId"`, Prisma.sql`"recipientId"`)} GROUP BY 1, 2
    UNION ALL
    SELECT "sellerId", "currentBidderId", 'sale', COUNT(*)::int
      FROM "Auction" WHERE status = 'SOLD' AND "currentBidderId" IS NOT NULL ${touching(Prisma.sql`"sellerId"`, Prisma.sql`"currentBidderId"`)} GROUP BY 1, 2
    UNION ALL
    SELECT "sellerId", "buyerId", 'sale', COUNT(*)::int
      FROM "BuyOrder" WHERE status = 'FILLED' AND "sellerId" IS NOT NULL ${touching(Prisma.sql`"sellerId"`, Prisma.sql`"buyerId"`)} GROUP BY 1, 2
    UNION ALL
    SELECT CASE WHEN "winnerId" = "creatorId" THEN "opponentId" ELSE "creatorId" END, "winnerId", 'flip', COUNT(*)::int
      FROM "CoinFlip" WHERE status = 'DONE' AND "winnerId" IS NOT NULL AND "opponentId" IS NOT NULL ${touching(Prisma.sql`"creatorId"`, Prisma.sql`"opponentId"`)} GROUP BY 1, 2
    UNION ALL
    SELECT "proposerId", "recipientId", 'swap', COUNT(*)::int
      FROM "Trade" WHERE status = 'ACCEPTED' ${touching(Prisma.sql`"proposerId"`, Prisma.sql`"recipientId"`)} GROUP BY 1, 2
    UNION ALL
    SELECT l."ownerId", o."bidderId", 'swap', COUNT(*)::int
      FROM "ListingOffer" o JOIN "TradeListing" l ON l.id = o."listingId" WHERE o.status = 'ACCEPTED' ${touching(Prisma.sql`l."ownerId"`, Prisma.sql`o."bidderId"`)} GROUP BY 1, 2`;
}

/** Joueurs qui n'ont qu'un seul ami accepté, et lequel ; `around` : seulement ceux où ce joueur figure. */
function loadOnlyFriends(around: string | null) {
  const touching = around ? Prisma.sql`AND (u = ${around} OR MIN(v) = ${around})` : Prisma.empty;
  return prisma.$queryRaw<{ userId: string; friendId: string }[]>`
    WITH f AS (
      SELECT "requesterId" AS u, "addresseeId" AS v FROM "Friendship" WHERE status = 'ACCEPTED'
      UNION ALL
      SELECT "addresseeId", "requesterId" FROM "Friendship" WHERE status = 'ACCEPTED'
    )
    SELECT u AS "userId", MIN(v) AS "friendId" FROM f GROUP BY u HAVING COUNT(*) = 1 ${touching}`;
}

const detectionSettings = () =>
  Promise.all([getSetting("multiAccount.sharedIpCap"), getSetting("multiAccount.minScore"), getSetting("multiAccount.scoring")]).then(([sharedCap, minScore, scoring]) => ({ sharedCap, minScore, scoring }));

type DetectionSettings = Awaited<ReturnType<typeof detectionSettings>>;

async function loadDetection({ includeGuests }: DetectionOptions, settings: DetectionSettings): Promise<DetectionInput> {
  const [users, signals, referrals, onlyFriends, transfers] = await Promise.all([
    prisma.user.findMany({
      where: { anonymizedAt: null, ...(includeGuests ? {} : { isGuest: false }) },
      select: { id: true, username: true, email: true, createdAt: true },
    }),
    prisma.userSignal.findMany({ select: { userId: true, kind: true, value: true } }),
    prisma.referral.findMany({ select: { referrerId: true, refereeId: true } }),
    loadOnlyFriends(null),
    loadTransfers(null),
  ]);
  return { users, signals, referrals, onlyFriends, transfers, ...settings };
}

/**
 * Détection autour d'un joueur (fiche joueur) : tous les comptes (les racines d'e-mail et de pseudo se comparent sur
 * tout le site), mais seulement les relevés qui partagent une clé avec les siens, ses parrainages, ses amitiés et ses
 * transferts. Les paires qui le touchent sortent identiques à la détection complète, pour bien moins de lectures.
 */
async function loadDetectionAround(userId: string, settings: DetectionSettings): Promise<DetectionInput> {
  const own = await prisma.userSignal.findMany({ where: { userId }, select: { kind: true, value: true } });
  const [users, signals, referrals, onlyFriends, transfers] = await Promise.all([
    prisma.user.findMany({ where: { anonymizedAt: null }, select: { id: true, username: true, email: true, createdAt: true } }),
    signalsSharing(own),
    prisma.referral.findMany({ where: { OR: [{ referrerId: userId }, { refereeId: userId }] }, select: { referrerId: true, refereeId: true } }),
    loadOnlyFriends(userId),
    loadTransfers(userId),
  ]);
  return { users, signals: signals.map(({ userId: id, kind, value }) => ({ userId: id, kind, value })), referrals, onlyFriends, transfers, ...settings };
}

export type MemberInfo = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  isGuest: boolean;
  banned: boolean;
  bannedAt: Date | null;
  discordLinked: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
  coins: number;
  cards: number;
};

/** Fiche courte de ces comptes (pseudo, rôle, ban, Discord…), pour les puces d'indices et les tableaux de membres. */
export async function membersById(ids: string[]): Promise<Map<string, MemberInfo>> {
  if (ids.length === 0) return new Map();
  // Exemplaires comptés pour ces comptes seulement (index ownerId) : un `_count` de Prisma dans le findMany
  // agrégeait toute la table UserCard à chaque fiche ou tableau de membres
  const [rows, copies] = await Promise.all([
    prisma.user.findMany({
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
      },
    }),
    prisma.userCard.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }),
  ]);
  const cards = new Map(copies.map((c) => [c.ownerId, c._count._all]));
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
        bannedAt: u.bannedAt,
        discordLinked: u.discordLinkedAt !== null,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        coins: u.coins,
        cards: cards.get(u.id) ?? 0,
      },
    ]),
  );
}

/**
 * Groupes calculés, gardés une minute par processus : la page relit tous les comptes, relevés et transferts du site,
 * et chaque filtre ou ban la recharge. La clé porte les réglages : un barème changé dans l'admin se voit aussitôt.
 * Les fiches des membres (bannis ou non) sont relues à chaque vue, jamais gardées ici.
 */
const CLUSTERS_TTL_MS = 60_000;
const clustersMemo = new Map<string, { at: number; clusters: Promise<SuspectCluster[]> }>();

function cachedClusters(options: DetectionOptions, settings: DetectionSettings): Promise<SuspectCluster[]> {
  const key = JSON.stringify([options.includeGuests, settings]);
  const now = Date.now();
  const hit = clustersMemo.get(key);
  if (hit && now - hit.at < CLUSTERS_TTL_MS) return hit.clusters;
  for (const [k, e] of clustersMemo) if (now - e.at >= CLUSTERS_TTL_MS) clustersMemo.delete(k);
  const entry = { at: now, clusters: loadDetection(options, settings).then(detectClusters) };
  clustersMemo.set(key, entry);
  // Lecture en échec : ne pas la resservir
  entry.clusters.catch(() => {
    if (clustersMemo.get(key) === entry) clustersMemo.delete(key);
  });
  return entry.clusters;
}

/** Groupes suspects avec la fiche courte de chaque membre. */
export async function suspectClusters(options: DetectionOptions): Promise<{ clusters: SuspectCluster[]; members: Map<string, MemberInfo>; minScore: number }> {
  const settings = await detectionSettings();
  const clusters = await cachedClusters(options, settings);
  const members = await membersById([...new Set(clusters.flatMap((c) => c.userIds))]);
  return { clusters, members, minScore: settings.minScore };
}

/** Comptes reliés à ce joueur (même sous le seuil), invités compris. */
export async function linkedAccountsFor(userId: string): Promise<{ pairs: SuspectPair[]; members: Map<string, MemberInfo>; minScore: number }> {
  const settings = await detectionSettings();
  const input = await loadDetectionAround(userId, settings);
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

/** IP et appareils de ce joueur, avec les autres comptes qui les partagent (même clé : une IPv6 par son /64 ; 5 au plus par ligne). */
export async function signalsFor(userId: string): Promise<SignalRow[]> {
  const own = await prisma.userSignal.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    select: { kind: true, value: true, firstEvent: true, firstSeenAt: true, lastSeenAt: true, hits: true },
  });
  if (own.length === 0) return [];
  // Du plus récent au plus ancien : les premiers nommés sont ceux qui l'ont utilisée en dernier
  const shared = (await signalsSharing(own)).filter((o) => o.userId !== userId);
  const byKey = new Map<string, string[]>();
  for (const o of shared) {
    const list = byKey.get(signalKey(o)) ?? [];
    if (!list.includes(o.userId)) list.push(o.userId);
    byKey.set(signalKey(o), list);
  }
  const shown = [...new Set([...byKey.values()].flatMap((ids) => ids.slice(0, 5)))];
  const users = shown.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: shown } }, select: { id: true, username: true } });
  const names = new Map(users.map((u) => [u.id, u]));
  return own.map((s) => {
    const ids = byKey.get(signalKey(s)) ?? [];
    return { ...s, others: ids.slice(0, 5).flatMap((id) => names.get(id) ?? []), otherCount: ids.length };
  });
}

type SharedIp = { value: string; accounts: number; usernames: { id: string; username: string; banned: boolean }[] };

/**
 * IP partagées par plusieurs comptes, par clé de ban (une IPv6 par son /64), les plus partagées d'abord. `prefix` :
 * recherche de l'admin, sans casse, sur le début de la clé ou d'une adresse relevée.
 */
export async function sharedIps(options: { prefix?: string; take: number }): Promise<SharedIp[]> {
  const rows = await prisma.userSignal.findMany({ where: { kind: "IP" }, select: { userId: true, value: true } });
  const groups = new Map<string, { users: Set<string>; values: Set<string> }>();
  for (const r of rows) {
    const value = r.value.toLowerCase();
    const key = ipBanKey(value) ?? value;
    const group = groups.get(key) ?? { users: new Set<string>(), values: new Set<string>() };
    group.users.add(r.userId);
    group.values.add(value);
    groups.set(key, group);
  }
  const search = options.prefix?.toLowerCase();
  const found = [...groups]
    .filter(([key, g]) => (search ? key.startsWith(search) || [...g.values].some((v) => v.startsWith(search)) : g.users.size >= 2))
    .sort(([ka, a], [kb, b]) => b.users.size - a.users.size || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .slice(0, options.take)
    .map(([value, g]) => ({ value, accounts: g.users.size, ids: [...g.users].sort().slice(0, 8) }));
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(found.flatMap((r) => r.ids))] } },
    select: { id: true, username: true, bannedAt: true },
  });
  const names = new Map(users.map((u) => [u.id, { id: u.id, username: u.username, banned: u.bannedAt !== null }]));
  return found.map((r) => ({
    value: r.value,
    accounts: r.accounts,
    usernames: r.ids.flatMap((id) => names.get(id) ?? []),
  }));
}

export type BannedAccount = { id: string; username: string; email: string | null; isGuest: boolean; bannedAt: Date; lastSeenAt: Date | null };

/** Comptes bannis (filtre « Comptes bannis » de /admin/multi-comptes), les plus récents d'abord. */
export async function bannedAccounts(options: { q: string; take: number }): Promise<{ rows: BannedAccount[]; total: number }> {
  const where = {
    bannedAt: { not: null },
    anonymizedAt: null,
    ...(options.q ? { username: { contains: options.q, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ bannedAt: "desc" }, { id: "asc" }],
      take: options.take,
      select: { id: true, username: true, email: true, isGuest: true, bannedAt: true, lastSeenAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, bannedAt: r.bannedAt! })), total };
}
