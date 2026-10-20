import type { PrismaClient } from "@/generated/prisma/client";
import { MAX_WISHLIST_CARDS } from "@/lib/collection/wishlist";

export type WishlistErrorCode = "NO_USER" | "BANNED" | "NOT_FOUND" | "FULL";

export class WishlistError extends Error {
  constructor(readonly code: WishlistErrorCode) {
    super(code);
  }
}

/** Écriture idempotente, sans condition de propriété de carte ; limite protégée par le verrou du joueur. */
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
    await tx.wishlistEntry.create({ data: { userId, cardId, position } });
    return true;
  });
}
