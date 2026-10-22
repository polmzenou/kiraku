import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ADMIN_USER_PAGE_SIZE, type SortDir, type UserListParams, type UserSort } from "@/lib/admin/users";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { normalizeSearch } from "@/lib/catalog/search";
import { prisma } from "../db";

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

export async function listAdminUsers({ query, filter, page: requestedPage, sort, dir }: UserListParams) {
  const where: Prisma.UserWhereInput = {
    ...(query ? { OR: [{ username: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { id: query }] } : {}),
    ...(filter === "registered" ? { isGuest: false } : filter === "guests" ? { isGuest: true } : filter === "admins" ? { role: "ADMIN" } : filter === "banned" ? { bannedAt: { not: null } } : {}),
  };
  const total = await prisma.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / ADMIN_USER_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const users = await prisma.user.findMany({ where, orderBy: [...USER_ORDER[sort](dir), { id: dir }], skip: page * ADMIN_USER_PAGE_SIZE, take: ADMIN_USER_PAGE_SIZE,
    select: { id: true, username: true, email: true, role: true, bannedAt: true, isGuest: true, coins: true, createdAt: true,
      deletionRequestedAt: true, anonymizedAt: true,
      _count: { select: { cards: true, discoveries: { where: { card: { status: "PUBLISHED" } } } } } },
  });
  return { users, total, page, pages };
}

export async function getAdminUser(userId: string, locale: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, username: true, email: true, emailVerified: true, isGuest: true, role: true, bannedAt: true, createdAt: true,
    coins: true, boosterStock: true, boosterAnchor: true, rankPoints: true, pityCount: true, standardCount: true, bannerPity: true,
    profileVisibility: true, showCollection: true, discordLinkedAt: true, referralCode: true,
    deletionRequestedAt: true, anonymizedAt: true, termsVersion: true,
    boosterCredits: { select: { boosterTypeId: true, count: true } },
    _count: { select: { cards: true, openings: true, sessions: true } },
  } });
  if (!user) return null;
  const [discoveries, catalogTotal, uniqueCards, ownedCatalogCards, boosterTypes, ledger, openings, logs] = await Promise.all([
    prisma.discovery.count({ where: { userId, card: { status: "PUBLISHED" } } }),
    prisma.card.count({ where: { status: "PUBLISHED" } }),
    prisma.card.count({ where: { copies: { some: { ownerId: userId } } } }),
    prisma.card.count({ where: { status: "PUBLISHED", copies: { some: { ownerId: userId } } } }),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, active: true, slug: true } }),
    prisma.coinTransaction.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, amount: true, reason: true, balanceAfter: true, createdAt: true } }),
    prisma.boosterOpening.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 15, select: { id: true, boosterSlug: true, createdAt: true, golden: true, divine: true } }),
    prisma.adminLog.findMany({ where: { targetType: "User", targetId: userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, action: true, before: true, after: true, createdAt: true, admin: { select: { username: true } } } }),
  ]);
  return { user, discoveries, catalogTotal, uniqueCards, ownedCatalogCards, ledger, openings, logs,
    boosterTypes: boosterTypes.map((b) => ({ ...b, name: localize(parseLocalized(b.name), locale), count: user.boosterCredits.find((c) => c.boosterTypeId === b.id)?.count ?? 0 })),
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
