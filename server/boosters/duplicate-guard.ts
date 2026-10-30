// Doublons des grandes raretés côté base : le client transactionnel est injecté (ouverture, sachets,
// lots, tests sur PGlite), comme pour open-core.ts.
import type { DuplicateGuard, OwnedCopies } from "@/lib/boosters/draw";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Exemplaires que le joueur possède, par carte des raretés protégées. Toutes les cartes à son nom
 * comptent, celles en vente ou en échange comprises. À lire dans la transaction du tirage, après le
 * verrou sur la ligne du joueur : deux ouvertures ne se chevauchent pas.
 */
export async function loadOwnedCopies(db: Pick<Prisma.TransactionClient, "userCard">, userId: string, guard: DuplicateGuard | undefined): Promise<OwnedCopies> {
  if (!guard || guard.rarities.length === 0) return new Map();
  const rows = await db.userCard.groupBy({
    by: ["cardId"],
    where: { ownerId: userId, card: { rarity: { in: [...guard.rarities] } } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}
