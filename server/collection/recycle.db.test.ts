import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { RecycleError, recycleWith } from "./recycle-core";
import { setShowcaseWith } from "./showcase-core";

// Concurrence du recyclage et de la vitrine sur une vraie base (branche Neon de dev) : sauté sans
// DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/collection/recycle.db.test.ts
// Crée un joueur jetable, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;
const values = SETTING_DEFAULTS["collection.recycleValues"];
const START = 1000;

describe.skipIf(!url)("recyclage atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  let userId: string;
  let common: { id: string; rarity: string };
  let other: { id: string; rarity: string };

  async function giveCopies(cardId: string, n: number) {
    await prisma.userCard.createMany({
      data: Array.from({ length: n }, (_, i) => ({ ownerId: userId, cardId, obtainedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) })),
    });
  }

  async function ledgerSum() {
    const agg = await prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  }

  beforeAll(async () => {
    const [c, o] = await Promise.all([
      prisma.card.findFirst({ where: { rarity: "COMMON", rank: { not: null } }, select: { id: true, rarity: true } }),
      prisma.card.findFirst({ where: { rarity: "RARE", rank: { not: null } }, select: { id: true, rarity: true } }),
    ]);
    if (!c || !o) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    common = c;
    other = o;
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: true, coins: START },
    });
    userId = user.id;
    // Solde de départ justifié par le journal, comme pour un vrai joueur
    await prisma.coinTransaction.create({ data: { userId, amount: START, reason: "SIGNUP" } });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.$transaction([
        prisma.showcaseSlot.deleteMany({ where: { userId } }),
        prisma.userCard.deleteMany({ where: { ownerId: userId } }),
        prisma.coinTransaction.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);
    }
    await prisma.$disconnect();
  }, 30_000);

  it("20 recyclages simultanés d'une carte en 11 exemplaires : il en reste exactement 1", async () => {
    await giveCopies(common.id, 11);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => recycleWith(prisma, userId, { kind: "card", cardId: common.id, count: 1 }, values)),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    for (const r of attempts.filter((a) => a.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RecycleError);
      expect(((r as PromiseRejectedResult).reason as RecycleError).code).toBe("NOTHING");
    }
    expect(ok).toHaveLength(10);

    const [left, user, dissolve] = await Promise.all([
      prisma.userCard.count({ where: { ownerId: userId, cardId: common.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId, reason: "DISSOLVE" }, _sum: { amount: true } }),
    ]);
    expect(left).toBe(1);
    expect(dissolve._sum.amount).toBe(10 * values.COMMON);
    expect(user.coins).toBe(START + 10 * values.COMMON);
    expect(user.coins).toBe(await ledgerSum());
  }, 60_000);

  it("un recyclage lancé en même temps qu'une mise en vitrine ne supprime jamais la carte exposée", async () => {
    await giveCopies(other.id, 3);
    const [, shown] = await Promise.allSettled([
      recycleWith(prisma, userId, { kind: "all", maxRarity: "MYTHIC", expected: 2 * values.RARE }, values),
      setShowcaseWith(prisma, userId, [other.id], 4),
    ]);
    const slots = await prisma.showcaseSlot.findMany({ where: { userId }, select: { userCard: { select: { cardId: true } } } });
    const copies = await prisma.userCard.count({ where: { ownerId: userId, cardId: other.id } });
    // Quel que soit l'ordre, au moins un exemplaire reste, et la vitrine pointe vers un exemplaire existant
    expect(copies).toBeGreaterThanOrEqual(1);
    if (shown.status === "fulfilled") expect(slots.map((s) => s.userCard.cardId)).toEqual([other.id]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
    expect(user.coins).toBe(await ledgerSum());
  }, 60_000);

  it("refuse un « tout recycler » dont le gain confirmé n'est plus à jour", async () => {
    await giveCopies(common.id, 3);
    await expect(
      recycleWith(prisma, userId, { kind: "all", maxRarity: "EPIC", expected: 999 }, values),
    ).rejects.toMatchObject({ code: "STALE" });
    expect(await prisma.userCard.count({ where: { ownerId: userId, cardId: common.id } })).toBe(4);
  }, 60_000);
});
