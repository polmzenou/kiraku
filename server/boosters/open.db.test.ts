import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { buildRarityTables, type CardPool } from "@/lib/boosters/draw";
import { DEFAULT_RULES } from "@/lib/boosters/fixtures";
import { seededRng } from "@/lib/boosters/rng";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { createPgAdapter } from "@/server/pg-adapter";
import { OpenError, openBoostersWith, type OpenType } from "./open-core";

// Test de concurrence sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/boosters/open.db.test.ts
// Crée un joueur jetable, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("ouverture atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const rules = { draw: DEFAULT_RULES, stock: { max: 10, ambassadorMax: 15, intervalMs: 10 * 60_000 } };
  const tables = buildRarityTables(DEFAULT_RULES.rates);
  let pool: CardPool;
  let userId: string;
  const standard: OpenType = {
    id: "test-standard",
    slug: "standard",
    kind: "STANDARD",
    usesFreeStock: true,
    priceZeni: null,
    countsForPity: true,
    bonusEligible: true,
  };
  const rare: OpenType = { ...standard, id: "test-rare", slug: "rare", usesFreeStock: false, priceZeni: 300, countsForPity: false, bonusEligible: false };

  beforeAll(async () => {
    const cards = await prisma.card.findMany({ where: { rank: { not: null } }, select: { id: true, rarity: true } });
    const byRarity = {} as Record<Rarity, string[]>;
    for (const r of RARITIES) byRarity[r] = [];
    for (const c of cards) byRarity[c.rarity as Rarity].push(c.id);
    pool = byRarity;
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: true, boosterStock: 10, coins: 1000 },
    });
    userId = user.id;
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.$transaction([
        prisma.userCard.deleteMany({ where: { ownerId: userId } }),
        prisma.discovery.deleteMany({ where: { userId } }),
        prisma.boosterOpening.deleteMany({ where: { userId } }),
        prisma.coinTransaction.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);
    }
    await prisma.$disconnect();
  }, 30_000);

  it("20 ouvertures simultanées pour 10 boosters : exactement 10 passent", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        openBoostersWith(prisma, { userId, type: standard, count: 1, rules, tables, pool, rng: seededRng(i) }),
      ),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const refused = attempts.filter((a) => a.status === "rejected");
    for (const r of refused) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(OpenError);
      expect(((r as PromiseRejectedResult).reason as OpenError).code).toBe("NO_BOOSTER");
    }
    expect(ok).toHaveLength(10);

    const [user, cards, openings] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { boosterStock: true, standardCount: true } }),
      prisma.userCard.count({ where: { ownerId: userId } }),
      prisma.boosterOpening.count({ where: { userId } }),
    ]);
    expect(user.boosterStock).toBe(0);
    expect(user.standardCount).toBe(10);
    expect(cards).toBe(40);
    expect(openings).toBe(10);
  }, 120_000);

  it("10 achats simultanés à 300 Zeni pour 1 000 Zeni : 3 passent, solde jamais négatif, journal juste", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, pityCount: true } });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        openBoostersWith(prisma, { userId, type: rare, count: 1, pay: true, rules, tables, pool, rng: seededRng(100 + i) }),
      ),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    for (const r of attempts.filter((a) => a.status === "rejected")) {
      expect(((r as PromiseRejectedResult).reason as OpenError).code).toBe("NOT_ENOUGH_ZENI");
    }
    expect(ok).toHaveLength(3);

    const [user, ledger] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, pityCount: true } }),
      prisma.coinTransaction.aggregate({ where: { userId, reason: "BOOSTER" }, _sum: { amount: true }, _count: true }),
    ]);
    expect(user.coins).toBe(100);
    expect(ledger._count).toBe(3);
    expect(ledger._sum.amount).toBe(user.coins - before.coins);
    // Un booster de rareté ne touche pas la pitié partagée
    expect(user.pityCount).toBe(before.pityCount);
  }, 120_000);

  it("chaque tirage garde les ids de Card de ses emplacements, même après suppression des exemplaires", async () => {
    const opening = await prisma.boosterOpening.findFirstOrThrow({
      where: { userId },
      select: { cardIds: true, catalogCardIds: true },
    });
    const copies = await prisma.userCard.findMany({ where: { id: { in: opening.cardIds } }, select: { id: true, cardId: true } });
    const cardOf = new Map(copies.map((c) => [c.id, c.cardId]));
    expect(opening.catalogCardIds).toEqual(opening.cardIds.map((id) => cardOf.get(id)));

    // Recyclage simulé : la page /tirage/[id] lit catalogCardIds, pas les exemplaires
    await prisma.userCard.deleteMany({ where: { id: { in: opening.cardIds } } });
    const after = await prisma.boosterOpening.findFirstOrThrow({ where: { userId }, select: { catalogCardIds: true } });
    expect(after.catalogCardIds).toHaveLength(opening.cardIds.length);
  }, 60_000);

  it("sans accord de paiement, rien n'est débité", async () => {
    await expect(
      openBoostersWith(prisma, { userId, type: rare, count: 1, rules, tables, pool, rng: seededRng(1) }),
    ).rejects.toMatchObject({ code: "NEEDS_PAYMENT" });
  }, 60_000);
});
