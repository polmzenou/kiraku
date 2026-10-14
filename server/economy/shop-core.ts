// Achat en Zeni dans la boutique, atomique. Client Prisma injecté (serveur ou test).
// Verrou User → article relu (en vente, prix affiché inchangé) → limite comptée sous verrou →
// Purchase PENDING → débit → livraison par fulfillPurchase, le même chemin qu'un futur paiement
// par carte.
import type { PrismaClient } from "@/generated/prisma/client";
import { limitPeriodKey, onSaleForZeni, remainingPurchases } from "@/lib/economy/shop";
import { fulfillPurchase } from "../payments/fulfill";
import { lockPlayers } from "../social/lock";
import { debit, LedgerError } from "./ledger";
import type { LotDeps, LotGrant } from "./lots";

export type ShopErrorCode = "NO_USER" | "BANNED" | "NOT_FOR_SALE" | "STALE" | "LIMIT_REACHED" | "NOT_ENOUGH_ZENI";

export class ShopError extends Error {
  constructor(readonly code: ShopErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };

export async function buyWithZeniWith(
  db: PrismaClient,
  input: { userId: string; shopItemId: string; expectedPrice: number; now: Date; timeZone: string },
  deps: LotDeps,
): Promise<{ purchaseId: string; coins: number; grant: LotGrant }> {
  return db.$transaction(async (tx) => {
    const player = (await lockPlayers(tx, [input.userId])).get(input.userId);
    if (!player) throw new ShopError("NO_USER");
    if (player.bannedAt) throw new ShopError("BANNED");

    const item = await tx.shopItem.findUnique({
      where: { id: input.shopItemId },
      select: {
        id: true,
        active: true,
        priceZeni: true,
        perUserLimit: true,
        limitPeriod: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!item || !onSaleForZeni(item, input.now)) throw new ShopError("NOT_FOR_SALE");
    // Le prix a changé depuis l'affichage : le joueur doit revoir ce qu'il paie
    if (item.priceZeni !== input.expectedPrice) throw new ShopError("STALE");
    const price = item.priceZeni;

    const periodKey = limitPeriodKey(item.limitPeriod, input.now, input.timeZone);
    if (item.perUserLimit !== null) {
      const bought = await tx.purchase.count({
        where: { userId: input.userId, shopItemId: item.id, periodKey, status: { in: ["PENDING", "PAID"] } },
      });
      if (remainingPurchases(item.perUserLimit, bought) === 0) throw new ShopError("LIMIT_REACHED");
    }

    const purchase = await tx.purchase.create({
      data: {
        userId: input.userId,
        shopItemId: item.id,
        currency: "ZENI",
        amount: price,
        status: "PENDING",
        periodKey,
        createdAt: input.now,
      },
      select: { id: true },
    });
    let coins: number;
    try {
      coins = await debit(tx, { userId: input.userId, amount: price, reason: "SHOP", refId: purchase.id, now: input.now });
    } catch (e) {
      if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new ShopError("NOT_ENOUGH_ZENI");
      throw e;
    }
    const grant = await fulfillPurchase(tx, purchase.id, deps, input.now);
    if (!grant) throw new Error("Achat déjà livré dans sa propre transaction");
    return { purchaseId: purchase.id, coins: grant.coins ?? coins, grant };
  }, TX);
}
