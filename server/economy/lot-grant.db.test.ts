import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { grantLotToUserWith, LotGrantError } from "./lot-grant-core";
import type { LotDeps } from "./lots";

// Envoi d'un lot par un admin sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/economy/lot-grant.db.test.ts
// (L'envoi à tous n'est pas testé ici : il servirait tous les joueurs de la base de test.)

const url = process.env.DATABASE_URL_TEST;
const deps: LotDeps = { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) };

describe.skipIf(!url)("envoi d'un lot par l'admin (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const users: string[] = [];
  let lotId: string;

  beforeAll(async () => {
    for (const tag of ["admin", "player", "banned"]) {
      const u = await prisma.user.create({
        data: {
          username: `test-${tag}-${randomBytes(3).toString("hex")}`,
          isGuest: false,
          role: tag === "admin" ? "ADMIN" : "USER",
          bannedAt: tag === "banned" ? new Date() : null,
        },
      });
      users.push(u.id);
    }
    const lot = await prisma.lot.create({ data: { name: { fr: "Test", en: "" }, zeni: 150 } });
    lotId = lot.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId: { in: users } } }),
      prisma.lotGrant.deleteMany({ where: { lotId } }),
      prisma.adminLog.deleteMany({ where: { adminId: users[0] } }),
      prisma.coinTransaction.deleteMany({ where: { userId: { in: users } } }),
      prisma.lot.delete({ where: { id: lotId } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("verse le lot, journalise et notifie ; refuse un banni", async () => {
    const [adminId, playerId, bannedId] = users;
    await grantLotToUserWith(prisma, { adminId, lotId, userId: playerId, reason: "test", now: new Date() }, deps);

    const player = await prisma.user.findUniqueOrThrow({ where: { id: playerId }, select: { coins: true } });
    expect(player.coins).toBe(150);
    const ledger = await prisma.coinTransaction.findMany({ where: { userId: playerId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: 150, reason: "ADMIN", balanceAfter: 150 });
    expect(await prisma.lotGrant.count({ where: { lotId, userId: playerId } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: playerId, type: "LOT_GRANTED" } })).toBe(1);
    expect(await prisma.adminLog.count({ where: { adminId, action: "LOT_GRANT", targetId: playerId } })).toBe(1);

    await expect(grantLotToUserWith(prisma, { adminId, lotId, userId: bannedId, reason: null, now: new Date() }, deps)).rejects.toBeInstanceOf(
      LotGrantError,
    );
    expect(await prisma.user.findUniqueOrThrow({ where: { id: bannedId }, select: { coins: true } })).toEqual({ coins: 0 });
  });
});
