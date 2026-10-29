import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { activateIncenseWith, cardsPulled, IncenseError } from "./incense-core";

// Test de concurrence sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/boosters/incense.db.test.ts
// Crée un joueur jetable avec 1 500 cartes tirées (un Encens), puis supprime ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("activation de l'Encens (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const settings = { cardStep: 1000, durationHours: 12 };
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: true } });
    userId = user.id;
    // 375 boosters de 4 cartes : seul le nombre de cartes compte
    await prisma.boosterOpening.createMany({
      data: Array.from({ length: 375 }, () => ({ userId, boosterSlug: "standard", cardIds: [], catalogCardIds: ["a", "b", "c", "d"] })),
    });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.$transaction([
        prisma.boosterOpening.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);
    }
    await prisma.$disconnect();
  }, 30_000);

  it("compte les cartes tirées, rétroactivement", async () => {
    expect(await cardsPulled(prisma, userId)).toBe(1500);
  });

  it("10 activations simultanées pour 1 Encens : une seule passe", async () => {
    const now = new Date();
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => activateIncenseWith(prisma, userId, settings, now)));
    const ok = attempts.filter((a) => a.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const a of attempts) {
      if (a.status === "rejected") expect((a.reason as IncenseError).code).toBe("NO_INCENSE");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { incenseUsed: true, incenseUntil: true } });
    expect(user.incenseUsed).toBe(1);
    expect(user.incenseUntil?.getTime()).toBe(now.getTime() + 12 * 3_600_000);
  }, 30_000);
});
