// Progression des missions, dérivée des journaux existants (ouvertures, découvertes, Zeni,
// cadeaux, amitiés) : aucun compteur à tenir à jour dans les chemins chauds, et la progression
// recalculée sous verrou au moment de réclamer est forcément la vraie. Client injecté.
import type { Prisma } from "@/generated/prisma/client";
import type { Rarity } from "@/lib/catalog/rarity";
import { raritiesFrom, SPEND_REASONS, type MissionMetric } from "@/lib/economy/missions";
import type { PeriodWindow } from "@/lib/economy/period";

type Db = Prisma.TransactionClient;

export type Measure = { metric: MissionMetric; rarity: Rarity | null };

/** Valeur atteinte par le joueur pour `measure` dans la fenêtre [start, end[. */
export async function measureProgress(db: Db, userId: string, measure: Measure, window: PeriodWindow): Promise<number> {
  const createdAt = { gte: window.start, lt: window.end };
  switch (measure.metric) {
    case "VISIT":
      return 1;
    case "OPEN_BOOSTERS":
      return db.boosterOpening.count({ where: { userId, createdAt } });
    case "PULL_RARITY": {
      const wanted = raritiesFrom(measure.rarity ?? "COMMON");
      // Cartes tirées (ids de Card gardés par chaque ouverture, même après recyclage ou vente)
      const [row] = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM "BoosterOpening" o
        CROSS JOIN LATERAL unnest(o."catalogCardIds") AS pulled(card_id)
        JOIN "Card" c ON c.id = pulled.card_id
        WHERE o."userId" = ${userId} AND o."createdAt" >= ${window.start} AND o."createdAt" < ${window.end}
          AND c.rarity::text = ANY(${wanted})`;
      return Number(row?.n ?? 0);
    }
    case "DISCOVER_CARDS":
      return db.discovery.count({ where: { userId, createdAt } });
    case "RECYCLE_ZENI": {
      const agg = await db.coinTransaction.aggregate({ where: { userId, reason: "DISSOLVE", createdAt }, _sum: { amount: true } });
      return agg._sum.amount ?? 0;
    }
    case "SPEND_ZENI": {
      const agg = await db.coinTransaction.aggregate({
        where: { userId, reason: { in: [...SPEND_REASONS] }, amount: { lt: 0 }, createdAt },
        _sum: { amount: true },
      });
      return Math.abs(agg._sum.amount ?? 0);
    }
    case "SEND_GIFTS":
      return db.gift.count({ where: { senderId: userId, createdAt } });
    case "ADD_FRIENDS":
      return db.friendship.count({
        where: { status: "ACCEPTED", acceptedAt: createdAt, OR: [{ requesterId: userId }, { addresseeId: userId }] },
      });
  }
}
