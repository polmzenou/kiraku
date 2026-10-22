import "server-only";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";

/** À appeler après le contrôle d'accès au profil ; aucune donnée de collection du visiteur. */
export async function getWishlist(ownerId: string, locale: string) {
  const entries = await prisma.wishlistEntry.findMany({
    where: { userId: ownerId }, orderBy: { position: "asc" }, select: { cardId: true },
  });
  const views = await cardViews(entries.map((entry) => entry.cardId), locale);
  return entries.flatMap((entry) => {
    const card = views.get(entry.cardId);
    return card ? [card] : [];
  });
}

/** Ids des cartes souhaitées par le joueur (panneau du booster sélectionné). */
export async function getWishlistCardIds(userId: string): Promise<string[]> {
  const entries = await prisma.wishlistEntry.findMany({ where: { userId }, select: { cardId: true } });
  return entries.map((entry) => entry.cardId);
}

/** Une seule fuda par carte, avec le nombre exact de ventes encore ouvertes. */
export async function getProfileSales(ownerId: string, locale: string, now = new Date()) {
  const groups = await prisma.auction.groupBy({
    by: ["cardId"],
    where: { sellerId: ownerId, status: "ACTIVE", endsAt: { gt: now } },
    _count: { _all: true },
    _min: { id: true },
    _max: { createdAt: true },
    orderBy: [{ _max: { createdAt: "desc" } }, { cardId: "asc" }],
  });
  const views = await cardViews(groups.map((group) => group.cardId), locale);
  return groups.flatMap((group) => {
    const card = views.get(group.cardId);
    return card && group._min.id ? [{ ...card, copies: group._count._all, auctionId: group._min.id }] : [];
  });
}
