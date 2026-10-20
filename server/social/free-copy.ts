// Choix de l'exemplaire qui part dans un échange (entre amis ou au Marché). Le client est celui de
// la transaction en cours : l'appelant a déjà verrouillé le joueur.
import { pickGiftCopy } from "@/lib/social/gifts";
import type { Tx } from "./lock";

/** Exemplaire libre (en collection) d'une carte, le plus récent hors vitrine. */
export async function freeCopy(tx: Tx, ownerId: string, cardId: string) {
  const copies = await tx.userCard.findMany({
    where: { ownerId, cardId, status: "COLLECTION" },
    select: { id: true, obtainedAt: true },
  });
  if (copies.length === 0) return null;
  const shown = await tx.showcaseSlot.findMany({
    where: { userId: ownerId, userCardId: { in: copies.map((c) => c.id) } },
    select: { userCardId: true },
  });
  return pickGiftCopy(copies, new Set(shown.map((s) => s.userCardId)));
}
