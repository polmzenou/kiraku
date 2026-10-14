// Livraison d'un achat, le même chemin pour la boutique en Zeni et pour un futur webhook de
// paiement par carte. Idempotente : PENDING → PAID par une mise à jour conditionnelle, puis le lot ;
// un deuxième appel (webhook rejoué, double clic) ne livre rien.
import type { Prisma } from "@/generated/prisma/client";
import { grantLot, type LotDeps, type LotGrant } from "../economy/lots";

type Tx = Prisma.TransactionClient;

export async function fulfillPurchase(
  tx: Tx,
  purchaseId: string,
  deps: LotDeps,
  now: Date = new Date(),
): Promise<LotGrant | null> {
  const paid = await tx.purchase.updateMany({
    where: { id: purchaseId, status: "PENDING" },
    data: { status: "PAID", paidAt: now },
  });
  if (paid.count !== 1) return null;
  const purchase = await tx.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    select: { userId: true, shopItem: { select: { lotId: true } } },
  });
  return grantLot(tx, purchase.userId, purchase.shopItem.lotId, { reason: "SHOP", refId: purchaseId }, deps, now);
}
