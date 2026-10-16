import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { AccountError, anonymizeUserWith, cancelDeletionWith, processDueDeletionsWith, requestDeletionWith } from "./account-core";
import { collectExportWith } from "./export-core";

// Droits RGPD sur une vraie base (branche Neon de dev) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/account/account.db.test.ts
// Crée deux joueurs jetables, puis supprime uniquement ce qu'ils ont créé.

const url = process.env.DATABASE_URL_TEST;
const START = 500;

describe.skipIf(!url)("suppression et anonymisation du compte (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  const ids: string[] = [];

  async function makePlayer(tag: string) {
    const user = await prisma.user.create({
      data: {
        username: `test-${tag}-${randomBytes(3).toString("hex")}`,
        email: `${randomBytes(6).toString("hex")}@test.kiraku`,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$test$test",
        isGuest: false,
        coins: START,
        image: "https://cdn.discordapp.com/avatars/test.png",
      },
    });
    ids.push(user.id);
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: START, reason: "SIGNUP" } });
    await prisma.account.create({
      data: { userId: user.id, type: "oauth", provider: "discord", providerAccountId: randomBytes(8).toString("hex"), access_token: "SECRET-ACCESS" },
    });
    await prisma.session.create({ data: { userId: user.id, sessionToken: randomBytes(16).toString("hex"), expires: new Date(Date.now() + 86_400_000) } });
    return user;
  }

  async function coinsSum() {
    const agg = await prisma.user.aggregate({ where: { id: { in: ids } }, _sum: { coins: true } });
    return agg._sum.coins ?? 0;
  }

  let a: { id: string; username: string };
  let b: { id: string; username: string };

  beforeAll(async () => {
    a = await makePlayer("a");
    b = await makePlayer("b");
    await prisma.friendship.create({
      data: { pairKey: [a.id, b.id].sort().join(":"), requesterId: a.id, addresseeId: b.id, status: "ACCEPTED", acceptedAt: new Date() },
    });
  }, 30_000);

  afterAll(async () => {
    if (ids.length) {
      await prisma.$transaction([
        prisma.dataRequest.deleteMany({ where: { userId: { in: ids } } }),
        prisma.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } }),
        prisma.session.deleteMany({ where: { userId: { in: ids } } }),
        prisma.account.deleteMany({ where: { userId: { in: ids } } }),
        prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } }),
        prisma.user.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    await prisma.$disconnect();
  }, 30_000);

  it("l'export ne contient ni hash, ni jeton, ni secret", async () => {
    const data = await collectExportWith(prisma, a.id, new Date());
    const text = JSON.stringify(data);
    expect(text).toContain(a.username);
    expect(text).not.toContain("argon2id");
    expect(text).not.toContain("SECRET-ACCESS");
    expect(text).not.toMatch(/sessionToken|passwordHash|access_token/);
  });

  it("demande de suppression : gel, double demande refusée, annulation", async () => {
    const now = new Date();
    const { dueAt } = await requestDeletionWith(prisma, { userId: a.id, now, graceDays: 30 });
    expect(dueAt.getTime() - now.getTime()).toBe(30 * 86_400_000);
    const frozen = await prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { deletionRequestedAt: true } });
    expect(frozen.deletionRequestedAt).not.toBeNull();
    // Toutes les sessions révoquées (aucun jeton à garder ici)
    expect(await prisma.session.count({ where: { userId: a.id } })).toBe(0);

    await expect(requestDeletionWith(prisma, { userId: a.id, now, graceDays: 30 })).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });

    await cancelDeletionWith(prisma, { userId: a.id, now });
    const back = await prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { deletionRequestedAt: true } });
    expect(back.deletionRequestedAt).toBeNull();
    const req = await prisma.dataRequest.findFirstOrThrow({ where: { userId: a.id, kind: "DELETION" } });
    expect(req.status).toBe("CANCELLED");
    await expect(cancelDeletionWith(prisma, { userId: a.id, now })).rejects.toBeInstanceOf(AccountError);
  });

  it("à l'échéance, anonymisation complète et somme des soldes inchangée", async () => {
    const before = await coinsSum();
    const ledgerBefore = await prisma.coinTransaction.count({ where: { userId: b.id } });
    const past = new Date(Date.now() - 31 * 86_400_000);
    await requestDeletionWith(prisma, { userId: b.id, now: past, graceDays: 30 });

    const result = await processDueDeletionsWith(prisma, new Date());
    expect(result.anonymized).toBeGreaterThanOrEqual(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(user.username).toMatch(/^supprime-[a-z2-9]{8}$/);
    expect(user).toMatchObject({ email: null, passwordHash: null, image: null, profileVisibility: "PRIVATE" });
    expect(user.anonymizedAt).not.toBeNull();
    expect(await prisma.account.count({ where: { userId: b.id } })).toBe(0);
    expect(await prisma.friendship.count({ where: { OR: [{ requesterId: b.id }, { addresseeId: b.id }] } })).toBe(0);
    // L'économie ne bouge pas : solde et journal gardés
    expect(await coinsSum()).toBe(before);
    expect(await prisma.coinTransaction.count({ where: { userId: b.id } })).toBe(ledgerBefore);
    const req = await prisma.dataRequest.findFirstOrThrow({ where: { userId: b.id, kind: "DELETION" } });
    expect(req.status).toBe("DONE");

    // Idempotent : une seconde passe ne fait rien
    expect(await anonymizeUserWith(prisma, { userId: b.id, now: new Date() })).toBe(false);
  });
});
