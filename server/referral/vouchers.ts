import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CardView } from "@/lib/boosters/view";
import { normalizeSearch, SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { ONE_OF_ONE_PRINTING } from "@/lib/prestige/printing";
import {
  ONE_OF_ONE_COPY,
  VOUCHER_MYTHIC,
  VOUCHER_PAGE_SIZE,
  voucherGroups,
  type VoucherFilter,
  type VoucherGroup,
  type VoucherKindKey,
} from "@/lib/referral/vouchers";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";

// Lectures des bons d'un joueur : ceux à utiliser, la grille du choix (recherche, filtres, pages), ceux déjà utilisés.

export type VoucherCardView = CardView & {
  /** Le joueur en a déjà un exemplaire (Mythique : ce serait un double). */
  owned: boolean;
  /** Sa 1/1 est déjà prise (bon 1/1 seulement). */
  taken: boolean;
};
export type VoucherPage = { items: VoucherCardView[]; nextOffset: number | null; total: number };
export type UsedVoucherView = { id: string; kind: VoucherKindKey; usedAt: Date; card: CardView | null };

const MAX_TERMS = 5;

/** Bons à utiliser du joueur, regroupés par type (le plus ancien sert au choix). */
export async function voucherGroupsOf(userId: string): Promise<VoucherGroup[]> {
  const rows = await prisma.voucher.findMany({ where: { userId, usedAt: null }, select: { id: true, kind: true, createdAt: true } });
  return voucherGroups(rows);
}

/** Bon à utiliser de ce joueur (son type) ; null s'il n'existe pas, n'est pas à lui ou a servi. */
export async function openVoucher(userId: string, voucherId: string): Promise<{ kind: VoucherKindKey } | null> {
  return prisma.voucher.findFirst({ where: { id: voucherId, userId, usedAt: null }, select: { kind: true } });
}

/** Séries dont le joueur a au moins une carte (filtre « Mes séries »). */
async function ownedSeries(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ seriesId: string }[]>`
    SELECT DISTINCT c."seriesId" FROM "UserCard" uc JOIN "Card" c ON c."id" = uc."cardId" WHERE uc."ownerId" = ${userId}`;
  return rows.map((r) => r.seriesId);
}

/**
 * Une page de la grille d'un bon : cartes publiées (Mythiques pour « Mythique au choix »), recherche sur le nom et la
 * série, filtre. Les plus hautes raretés d'abord pour la 1/1, puis les plus populaires (rang AniList).
 */
export async function voucherCards(input: {
  userId: string;
  kind: VoucherKindKey;
  q: string;
  filter: VoucherFilter;
  offset: number;
  locale: string;
}): Promise<VoucherPage> {
  const { userId } = input;
  const one = input.kind === "ONE_OF_ONE";
  const terms = normalizeSearch(input.q.slice(0, SEARCH_MAX_LENGTH)).split(" ").filter(Boolean).slice(0, MAX_TERMS);
  const where: Prisma.CardWhereInput = {
    status: "PUBLISHED",
    ...(!one && { rarity: VOUCHER_MYTHIC }),
    AND: terms.map((term) => ({ searchText: { contains: term } })),
    ...(input.filter === "free" &&
      (one ? { printings: { none: { printing: ONE_OF_ONE_PRINTING, issued: { gt: 0 } } } } : { copies: { none: { ownerId: userId } } })),
    ...(input.filter === "series" && { seriesId: { in: await ownedSeries(userId) } }),
  };
  const orderBy: Prisma.CardOrderByWithRelationInput[] = [
    ...(one ? [{ rarityDefinition: { sortOrder: "desc" as const } }, { rarityDefinition: { variantRequired: "desc" as const } }, { rarity: "desc" as const }] : []),
    { rank: { sort: "asc", nulls: "last" } },
    { id: "asc" },
  ];
  const [rows, total] = await Promise.all([
    prisma.card.findMany({ where, orderBy, skip: input.offset, take: VOUCHER_PAGE_SIZE + 1, select: { id: true } }),
    prisma.card.count({ where }),
  ]);
  const ids = rows.slice(0, VOUCHER_PAGE_SIZE).map((r) => r.id);
  const [views, owned, taken] = await Promise.all([
    cardViews(ids, input.locale),
    prisma.userCard.findMany({ where: { ownerId: userId, cardId: { in: ids } }, distinct: ["cardId"], select: { cardId: true } }),
    one
      ? prisma.cardPrinting.findMany({ where: { cardId: { in: ids }, printing: ONE_OF_ONE_PRINTING, issued: { gt: 0 } }, select: { cardId: true } })
      : Promise.resolve([]),
  ]);
  const ownedIds = new Set(owned.map((o) => o.cardId));
  const takenIds = new Set(taken.map((t) => t.cardId));
  return {
    items: ids.flatMap((id) => {
      const view = views.get(id);
      return view ? [{ ...view, owned: ownedIds.has(id), taken: takenIds.has(id) }] : [];
    }),
    nextOffset: rows.length > VOUCHER_PAGE_SIZE ? input.offset + VOUCHER_PAGE_SIZE : null,
    total,
  };
}

/** Bons déjà utilisés, les plus récents d'abord, avec la carte choisie (la 1/1 avec son numéro). */
export async function usedVouchersOf(userId: string, locale: string, limit = 24): Promise<UsedVoucherView[]> {
  const rows = await prisma.voucher.findMany({
    where: { userId, usedAt: { not: null } },
    orderBy: [{ usedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, kind: true, usedAt: true, cardId: true },
  });
  const views = await cardViews(rows.flatMap((r) => (r.cardId ? [r.cardId] : [])), locale);
  return rows.flatMap((r) => {
    if (!r.usedAt) return [];
    const view = (r.cardId && views.get(r.cardId)) || null;
    return [{ id: r.id, kind: r.kind, usedAt: r.usedAt, card: view && r.kind === "ONE_OF_ONE" ? { ...view, copy: ONE_OF_ONE_COPY } : view }];
  });
}
