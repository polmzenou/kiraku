import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { MAX_WISHLIST_CARDS } from "@/lib/collection/wishlist";

export type WishlistErrorCode = "NO_USER" | "BANNED" | "NOT_FOUND" | "FULL" | "OWNED";

export class WishlistError extends Error {
  constructor(readonly code: WishlistErrorCode) {
    super(code);
  }
}

/** Écriture idempotente ; une carte déjà possédée ne s'ajoute pas. Limite protégée par le verrou du joueur. */
export async function setWishlistWith(db: PrismaClient, userId: string, cardId: string, wished: boolean): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<{ bannedAt: Date | null }[]>`
      SELECT "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new WishlistError("NO_USER");
    if (user.bannedAt) throw new WishlistError("BANNED");

    if (!wished) {
      await tx.wishlistEntry.deleteMany({ where: { userId, cardId } });
      return false;
    }

    const entries = await tx.wishlistEntry.findMany({ where: { userId }, select: { cardId: true, position: true } });
    if (entries.some((entry) => entry.cardId === cardId)) return true;
    const used = new Set(entries.map((entry) => entry.position));
    let position = 1;
    while (used.has(position)) position++;
    if (position > MAX_WISHLIST_CARDS) throw new WishlistError("FULL");

    const card = await tx.card.findUnique({ where: { id: cardId }, select: { status: true } });
    if (!card || card.status !== "PUBLISHED") throw new WishlistError("NOT_FOUND");
    // Tous les exemplaires comptent, même en vente ou engagés en combat
    if ((await tx.userCard.count({ where: { ownerId: userId, cardId } })) > 0) throw new WishlistError("OWNED");
    await tx.wishlistEntry.create({ data: { userId, cardId, position } });
    return true;
  });
}

/**
 * Le joueur vient d'obtenir ces cartes : elles quittent sa liste de souhaits, dans la transaction
 * du versement. Renvoie celles qui y figuraient (pastille au reveal).
 */
export async function consumeWishlist(tx: Prisma.TransactionClient, userId: string, cardIds: readonly string[]): Promise<Set<string>> {
  if (cardIds.length === 0) return new Set();
  const ids = [...new Set(cardIds)];
  const entries = await tx.wishlistEntry.findMany({ where: { userId, cardId: { in: ids } }, select: { cardId: true } });
  if (entries.length === 0) return new Set();
  await tx.wishlistEntry.deleteMany({ where: { userId, cardId: { in: entries.map((e) => e.cardId) } } });
  return new Set(entries.map((e) => e.cardId));
}
