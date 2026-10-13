// Ouverture atomique de boosters. Le client Prisma est injecté (serveur ou test de concurrence) :
// pas de server/db.ts ici. Le serveur décide de tout : stock, tirage, cartes, pitié.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BoosterSlug } from "@/lib/boosters/catalog";
import { drawBoosters, type CardPool, type DrawRules, type RarityTables } from "@/lib/boosters/draw";
import type { Rng } from "@/lib/boosters/rng";
import { computeStock, consumeStock, type StockRules, type StockState } from "@/lib/boosters/stock";
import type { Rarity } from "@/lib/catalog/rarity";

export type OpenErrorCode = "NO_USER" | "BANNED" | "NO_BOOSTER" | "EMPTY_POOL";

export class OpenError extends Error {
  constructor(readonly code: OpenErrorCode) {
    super(code);
  }
}

export type OpenInput = {
  userId: string;
  slug: BoosterSlug;
  count: number;
  rules: { draw: DrawRules; stock: StockRules };
  tables: RarityTables;
  pool: CardPool;
  rng: Rng;
};

export type OpenedBoosterRow = {
  id: string;
  golden: boolean;
  divine: boolean;
  pityTriggered: boolean;
  cards: { userCardId: string; cardId: string; rarity: Rarity; isNew: boolean }[];
};

export type OpenOutcome = {
  boosters: OpenedBoosterRow[];
  stock: StockState;
  pityCount: number;
  standardCount: number;
};

type LockedUser = {
  boosterStock: number;
  boosterAnchor: Date;
  pityCount: number;
  standardCount: number;
  bannedAt: Date | null;
};

export async function openBoostersWith(db: PrismaClient, input: OpenInput): Promise<OpenOutcome> {
  const { userId, count, rules } = input;
  if (Object.values(input.pool).every((ids) => ids.length === 0)) throw new OpenError("EMPTY_POOL");

  return db.$transaction(
    async (tx) => {
      // Verrou sur la ligne du joueur : deux ouvertures simultanées passent l'une après l'autre
      const [user] = await tx.$queryRaw<LockedUser[]>`
        SELECT "boosterStock", "boosterAnchor", "pityCount", "standardCount", "bannedAt"
        FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!user) throw new OpenError("NO_USER");
      if (user.bannedAt) throw new OpenError("BANNED");

      const now = new Date();
      const current = computeStock(user.boosterStock, user.boosterAnchor, now, rules.stock);
      if (current.stock < count) throw new OpenError("NO_BOOSTER");
      const stock = consumeStock(current, count, rules.stock);

      const drawn = drawBoosters(input.rng, {
        pool: input.pool,
        rules: rules.draw,
        tables: input.tables,
        state: { pityCount: user.pityCount, standardCount: user.standardCount },
        count,
      });

      // « Nouveau » : jamais obtenue avant, et seulement le premier exemplaire de ce tirage
      const drawnIds = [...new Set(drawn.boosters.flatMap((b) => b.cards.map((c) => c.cardId)))];
      const known = await tx.discovery.findMany({
        where: { userId, cardId: { in: drawnIds } },
        select: { cardId: true },
      });
      const seen = new Set(known.map((k) => k.cardId));

      const boosters: OpenedBoosterRow[] = drawn.boosters.map((b) => ({
        id: randomUUID(),
        golden: b.golden,
        divine: b.divine,
        pityTriggered: b.pityTriggered,
        cards: b.cards.map((c) => {
          const isNew = !seen.has(c.cardId);
          seen.add(c.cardId);
          return { userCardId: randomUUID(), cardId: c.cardId, rarity: c.rarity, isNew };
        }),
      }));
      const discovered = boosters.flatMap((b) => b.cards.filter((c) => c.isNew).map((c) => c.cardId));

      await tx.userCard.createMany({
        data: boosters.flatMap((b) =>
          b.cards.map((c) => ({ id: c.userCardId, ownerId: userId, cardId: c.cardId, obtainedAt: now })),
        ),
      });
      if (discovered.length > 0) {
        await tx.discovery.createMany({
          data: discovered.map((cardId) => ({ userId, cardId, createdAt: now })),
          skipDuplicates: true,
        });
      }
      await tx.boosterOpening.createMany({
        data: boosters.map((b) => ({
          id: b.id,
          userId,
          boosterSlug: input.slug,
          cardIds: b.cards.map((c) => c.userCardId),
          golden: b.golden,
          divine: b.divine,
          pityTriggered: b.pityTriggered,
          createdAt: now,
        })),
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          boosterStock: stock.stock,
          boosterAnchor: stock.anchor,
          pityCount: drawn.state.pityCount,
          standardCount: drawn.state.standardCount,
        },
      });

      return { boosters, stock, pityCount: drawn.state.pityCount, standardCount: drawn.state.standardCount };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
