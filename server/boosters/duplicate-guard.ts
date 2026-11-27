// Doublons des grandes raretés côté base : le client transactionnel est injecté (ouverture, sachets,
// lots, tests sur PGlite), comme pour open-core.ts.
import { guardedCardIds, type CardPool, type DuplicateGuard, type OwnedCopies } from "@/lib/boosters/draw";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Exemplaires que le joueur possède, par carte protégée du pool tiré (raretés protégées : guardedCardIds).
 * Toutes les cartes à son nom comptent, celles en vente ou en échange comprises. À lire dans la transaction du
 * tirage, après le verrou sur la ligne du joueur : deux ouvertures ne se chevauchent pas.
 * Seules ces cartes sont lues (index ownerId, cardId), sans jointure au catalogue : guardState ignore les
 * autres. Joindre tous les exemplaires du joueur à Card à chaque ouverture, sous son verrou, était très
 * probablement la source des 162 millions de lectures de Card_pkey et de la plupart des 153 643 parcours
 * complets de Card relevés en production du 28/10 au 26/11 (un parcours par ouverture d'un gros collectionneur).
 */
export async function loadOwnedCopies(
  db: Pick<Prisma.TransactionClient, "userCard">,
  userId: string,
  guard: DuplicateGuard | undefined,
  pool: CardPool,
): Promise<OwnedCopies> {
  const ids = guardedCardIds(guard, pool);
  if (ids.length === 0) return new Map();
  const rows = await db.userCard.groupBy({
    by: ["cardId"],
    where: { ownerId: userId, cardId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}
