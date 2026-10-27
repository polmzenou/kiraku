import "server-only";
import { prisma } from "../db";

/** Parmi `cardIds`, celles dont le joueur a au moins un exemplaire (pastille « Acquise » des autres collections). */
export async function ownedCardIds(userId: string | null | undefined, cardIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(cardIds)];
  if (!userId || ids.length === 0) return [];
  const rows = await prisma.userCard.findMany({
    where: { ownerId: userId, cardId: { in: ids } },
    select: { cardId: true },
    distinct: ["cardId"],
  });
  return rows.map((r) => r.cardId);
}
