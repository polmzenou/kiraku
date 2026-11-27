import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ADMIN_USER_PAGE_SIZE, type AdminPrinting, type AdminUserCopy, type SortDir, type UserListParams, type UserSort } from "@/lib/admin/users";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { incenseAvailable, incenseEarned, isIncenseActive } from "@/lib/boosters/incense";
import { normalizeSearch } from "@/lib/catalog/search";
import { cardsPulled } from "../boosters/incense-core";
import { prisma } from "../db";
import { getSetting } from "../settings";

/** Tri de la liste : une colonne et un sens, toujours départagés par l'identifiant (pages stables). */
const USER_ORDER = {
  created: (dir) => [{ createdAt: dir }],
  name: (dir) => [{ username: dir }],
  email: (dir) => [{ email: { sort: dir, nulls: "last" } }],
  // Bannis, admins, inscrits, invités (et l'inverse)
  status: (dir) => [
    { bannedAt: { sort: dir === "asc" ? "desc" : "asc", nulls: dir === "asc" ? "last" : "first" } },
    { role: dir === "asc" ? "desc" : "asc" },
    { isGuest: dir },
  ],
  coins: (dir) => [{ coins: dir }],
  cards: (dir) => [{ cards: { _count: dir } }],
  discoveries: (dir) => [{ discoveries: { _count: dir } }],
} satisfies Record<UserSort, (dir: SortDir) => Prisma.UserOrderByWithRelationInput[]>;

/**
 * Une page de la liste des joueurs. `emails` faux (DEV, lecture seule) : ni recherche ni tri sur l'e-mail, qui
 * révéleraient l'adresse d'un joueur (« ce compte a-t-il cette adresse ? ») sans jamais l'afficher.
 */
export async function listAdminUsers({ query, filter, page: requestedPage, sort: requestedSort, dir }: UserListParams, { emails }: { emails: boolean }) {
  const sort = !emails && requestedSort === "email" ? "created" : requestedSort;
  const matches: Prisma.UserWhereInput[] = [
    { username: { contains: query, mode: "insensitive" } },
    ...(emails ? [{ email: { contains: query, mode: "insensitive" as const } }] : []),
    { id: query },
  ];
  const where: Prisma.UserWhereInput = {
    ...(query ? { OR: matches } : {}),
    ...(filter === "registered" ? { isGuest: false } : filter === "guests" ? { isGuest: true } : filter === "admins" ? { role: { in: ["ADMIN", "DEV"] } } : filter === "ambassadors" ? { ambassadorSince: { not: null } } : filter === "banned" ? { bannedAt: { not: null } } : {}),
  };
  const total = await prisma.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / ADMIN_USER_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const rows = await prisma.user.findMany({ where, orderBy: [...USER_ORDER[sort](dir), { id: dir }], skip: page * ADMIN_USER_PAGE_SIZE, take: ADMIN_USER_PAGE_SIZE,
    select: { id: true, username: true, email: true, role: true, bannedAt: true, isGuest: true, coins: true, createdAt: true, ambassadorSince: true,
      deletionRequestedAt: true, anonymizedAt: true,
      _count: { select: {
        cards: true, discoveries: { where: { card: { status: "PUBLISHED" } } },
        // Une amitié est une seule ligne, dans un sens ou dans l'autre
        sentFriends: { where: { status: "ACCEPTED" } }, recvFriends: { where: { status: "ACCEPTED" } },
      } } },
  });
  const previews = await friendPreviews(rows.map((u) => u.id));
  const users = rows.map(({ _count: { sentFriends, recvFriends, ...count }, ...u }) => ({
    ...u, _count: count, friends: { count: sentFriends + recvFriends, preview: previews.get(u.id) ?? [] },
  }));
  return { users, total, page, pages };
}

/** Amis montrés dans la liste des joueurs, les plus récents d'abord ; la fiche les montre tous. */
export const FRIEND_PREVIEW = 3;

export type AdminFriendPreview = { id: string; username: string };

/** Premiers amis de chaque joueur de la page, en une requête (bornée à FRIEND_PREVIEW par joueur). */
async function friendPreviews(userIds: string[]): Promise<Map<string, AdminFriendPreview[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ userId: string; id: string; username: string }[]>`
    SELECT "userId", id, username FROM (
      SELECT f."userId", u.id, u.username,
        ROW_NUMBER() OVER (PARTITION BY f."userId" ORDER BY f.since DESC, u.id) AS n
      FROM (
        SELECT "requesterId" AS "userId", "addresseeId" AS "friendId", COALESCE("acceptedAt", "createdAt") AS since
        FROM "Friendship" WHERE status = 'ACCEPTED' AND "requesterId" = ANY(${userIds})
        UNION ALL
        SELECT "addresseeId", "requesterId", COALESCE("acceptedAt", "createdAt")
        FROM "Friendship" WHERE status = 'ACCEPTED' AND "addresseeId" = ANY(${userIds})
      ) f JOIN "User" u ON u.id = f."friendId"
    ) ranked WHERE n <= ${FRIEND_PREVIEW} ORDER BY "userId", n`;
  const byUser = new Map<string, AdminFriendPreview[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), { id: row.id, username: row.username }]);
  return byUser;
}

/** Plafond d'affichage sur la fiche : au-delà, le total reste exact et le reste est résumé. */
const FRIEND_LIST_LIMIT = 500;

/** Tous les amis d'un joueur (identité et date), les plus récents d'abord. */
export async function getAdminUserFriends(userId: string) {
  const where = { status: "ACCEPTED" as const, OR: [{ requesterId: userId }, { addresseeId: userId }] };
  const identity = { select: { id: true, username: true, email: true, role: true, isGuest: true, bannedAt: true, ambassadorSince: true, anonymizedAt: true } } as const;
  const [total, rows] = await Promise.all([
    prisma.friendship.count({ where }),
    prisma.friendship.findMany({
      where,
      orderBy: [{ acceptedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
      take: FRIEND_LIST_LIMIT,
      select: { id: true, requesterId: true, acceptedAt: true, createdAt: true, requester: identity, addressee: identity },
    }),
  ]);
  return {
    total,
    friends: rows.map((f) => ({
      friendshipId: f.id,
      since: f.acceptedAt ?? f.createdAt,
      ...(f.requesterId === userId ? f.addressee : f.requester),
    })),
  };
}

export async function getAdminUser(userId: string, locale: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, username: true, email: true, emailVerified: true, isGuest: true, role: true, bannedAt: true, createdAt: true, ambassadorSince: true,
    leaderboardHiddenAt: true, leaderboardMalus: true, leaderboardMythicMalus: true, coins: true, boosterStock: true, boosterAnchor: true, rankPoints: true, pityCount: true, standardCount: true, bannerPity: true,
    profileVisibility: true, showCollection: true, discordLinkedAt: true, referralCode: true,
    deletionRequestedAt: true, anonymizedAt: true, termsVersion: true, incenseUsed: true, incenseBonus: true, incenseUntil: true,
    boosterCredits: { select: { boosterTypeId: true, count: true } },
    sealedDrops: { where: { openedAt: null }, select: { boosterTypeId: true } },
    _count: { select: { cards: true, openings: true, sessions: true } },
  } });
  if (!user) return null;
  const [discoveries, catalogTotal, uniqueCards, ownedCatalogCards, boosterTypes, ledger, openings, logs, pulled, incenseStep] = await Promise.all([
    prisma.discovery.count({ where: { userId, card: { status: "PUBLISHED" } } }),
    prisma.card.count({ where: { status: "PUBLISHED" } }),
    prisma.card.count({ where: { copies: { some: { ownerId: userId } } } }),
    prisma.card.count({ where: { status: "PUBLISHED", copies: { some: { ownerId: userId } } } }),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, active: true, slug: true, kind: true } }),
    prisma.coinTransaction.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, amount: true, reason: true, balanceAfter: true, createdAt: true } }),
    prisma.boosterOpening.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 15, select: { id: true, boosterSlug: true, createdAt: true, golden: true, divine: true } }),
    prisma.adminLog.findMany({ where: { targetType: "User", targetId: userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, action: true, before: true, after: true, createdAt: true, admin: { select: { username: true } } } }),
    cardsPulled(prisma, userId),
    getSetting("incense.cardStep"),
  ]);
  const now = new Date();
  return { user, discoveries, catalogTotal, uniqueCards, ownedCatalogCards, ledger, openings, logs,
    incense: {
      available: incenseAvailable(pulled, incenseStep, user.incenseUsed, user.incenseBonus),
      earned: incenseEarned(pulled, incenseStep),
      bonus: user.incenseBonus,
      used: user.incenseUsed,
      activeUntil: isIncenseActive(user.incenseUntil, now) ? user.incenseUntil : null,
    },
    // Sachets scellés : nombre de sachets non ouverts ; autres types : boosters crédités
    boosterTypes: boosterTypes.map((b) => ({
      ...b,
      name: localize(parseLocalized(b.name), locale),
      count: b.kind === "DROP"
        ? user.sealedDrops.filter((d) => d.boosterTypeId === b.id).length
        : (user.boosterCredits.find((c) => c.boosterTypeId === b.id)?.count ?? 0),
    })),
  };
}

/** Collection et découvertes, groupées par modèle de carte, avec pagination en base. */
export async function getAdminUserCards(userId: string, query: string, requestedPage: number) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  const where: Prisma.CardWhereInput = {
    OR: [{ copies: { some: { ownerId: userId } } }, { discoveries: { some: { userId } } }],
    ...(terms.length ? { AND: terms.map((term) => ({ searchText: { contains: term } })) } : {}),
  };
  const total = await prisma.card.count({ where });
  const pages = Math.max(1, Math.ceil(total / ADMIN_USER_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const cards = await prisma.card.findMany({ where, orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip: page * ADMIN_USER_PAGE_SIZE, take: ADMIN_USER_PAGE_SIZE,
    select: { id: true, anilistId: true, publicId: true, appearance: true, name: true, rarity: true, rank: true, discoveries: { where: { userId }, select: { cardId: true } },
      _count: { select: { copies: { where: { ownerId: userId } } } } },
  });
  return { cards, total, page, pages };
}

export async function adminCardById(id: string) {
  const card = await prisma.card.findUnique({ where: { id }, select: { id: true, anilistId: true, publicId: true, appearance: true, name: true, imageUrl: true, rarity: true, rank: true, series: { select: { titleRomaji: true } } } });
  return card ? { ...card, anilistId: card.publicId, series: card.series.titleRomaji } : null;
}

export const ADMIN_USER_COPIES_LIMIT = 60;

/**
 * Exemplaires d'une carte chez le joueur (fiche admin) : héritiers et gravés d'abord, puis les plus récents. Avec les
 * tirages gravés de la carte, pour choisir un numéro libre.
 */
export async function getAdminUserCopies(userId: string, cardId: string): Promise<{ copies: AdminUserCopy[]; total: number; printings: AdminPrinting[] }> {
  const where = { ownerId: userId, cardId };
  const [rows, total, printings] = await Promise.all([
    prisma.userCard.findMany({
      where,
      orderBy: [{ heritage: "desc" }, { printing: { sort: "asc", nulls: "last" } }, { obtainedAt: "desc" }, { id: "asc" }],
      take: ADMIN_USER_COPIES_LIMIT,
      select: { id: true, status: true, heritage: true, keptByOwner: true, printing: true, serial: true, obtainedAt: true, edition: { select: { size: true } } },
    }),
    prisma.userCard.count({ where }),
    prisma.cardPrinting.findMany({ where: { cardId }, orderBy: { printing: "asc" }, select: { printing: true, size: true, taken: true } }),
  ]);
  return { copies: rows.map(({ edition, ...c }) => ({ ...c, size: edition?.size ?? null })), total, printings };
}
