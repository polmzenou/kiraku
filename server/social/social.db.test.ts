import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { pairKey } from "@/lib/social/relation";
import { createPgAdapter } from "@/server/pg-adapter";
import { setShowcaseWith } from "../collection/showcase-core";
import { blockWith, sendRequestWith, type FriendLimits } from "./friendship-core";
import { GiftError, giftBoosterWith, giftCardWith, type GiftContext } from "./gift-core";

// Concurrence des amis et des cadeaux sur une vraie base (base de test isolée) : sauté sans
// DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/social/social.db.test.ts
// Crée des joueurs jetables, puis supprime uniquement ce qu'ils ont créé.

const url = process.env.DATABASE_URL_TEST;
const START = 1000;
const limits: FriendLimits = { maxFriends: 200, maxOutgoing: 20, cooldownHours: 72 };
const rules = { enabled: true, perDaySent: 3, perDayReceived: 5, minAccountAgeHours: 48, minFriendshipHours: 24 };
const OLD = new Date(Date.now() - 30 * 86_400_000);

describe.skipIf(!url)("amis et cadeaux atomiques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const ids: string[] = [];
  let cardId: string;

  async function player() {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins: START, createdAt: OLD },
    });
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: START, reason: "SIGNUP" } });
    ids.push(user.id);
    return user.id;
  }

  /** Amitié acceptée depuis longtemps, pour passer les règles d'ancienneté. */
  async function befriend(a: string, b: string) {
    await prisma.friendship.create({
      data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", createdAt: OLD, acceptedAt: OLD },
    });
  }

  async function balanceMatchesLedger(userId: string) {
    const [user, agg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    return user.coins === (agg._sum.amount ?? 0);
  }

  const ctx = (senderId: string, recipientId: string): GiftContext => ({ senderId, recipientId, rules, timeZone: "Europe/Paris" });

  beforeAll(async () => {
    const c = await prisma.card.findFirst({ where: { rarity: "COMMON", rank: { not: null } }, select: { id: true } });
    if (!c) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    cardId = c.id;
  }, 30_000);

  afterAll(async () => {
    if (ids.length > 0) {
      const where = { userId: { in: ids } };
      await prisma.$transaction([
        prisma.notification.deleteMany({ where }),
        prisma.gift.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } }),
        prisma.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } }),
        prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } }),
        prisma.showcaseSlot.deleteMany({ where }),
        prisma.discovery.deleteMany({ where }),
        prisma.userCard.deleteMany({ where: { ownerId: { in: ids } } }),
        prisma.coinTransaction.deleteMany({ where }),
        prisma.user.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    await prisma.$disconnect();
  }, 30_000);

  it("deux demandes croisées simultanées donnent une seule amitié acceptée", async () => {
    const [a, b] = [await player(), await player()];
    const results = await Promise.all([sendRequestWith(prisma, a, b, limits), sendRequestWith(prisma, b, a, limits)]);
    expect(results.sort()).toEqual(["ACCEPTED", "SENT"]);
    const rows = await prisma.friendship.findMany({ where: { pairKey: pairKey(a, b) } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ACCEPTED");
  }, 60_000);

  it("une demande vers un joueur qui m'a bloqué répond « envoyée » sans le notifier", async () => {
    const [a, b] = [await player(), await player()];
    await blockWith(prisma, b, a);
    expect(await sendRequestWith(prisma, a, b, limits)).toBe("SENT");
    expect(await prisma.notification.count({ where: { userId: b } })).toBe(0);
    const row = await prisma.friendship.findUniqueOrThrow({ where: { pairKey: pairKey(a, b) } });
    expect(row.declinedAt).not.toBeNull();
  }, 60_000);

  it("le rappel du push reçoit les notifications validées, et rien si la transaction échoue", async () => {
    const [a, b] = [await player(), await player()];
    const pushed: string[][] = [];
    expect(await sendRequestWith(prisma, a, b, limits, (ids) => pushed.push(ids))).toBe("SENT");
    expect(pushed).toHaveLength(1);
    const [id] = pushed[0];
    expect(await prisma.notification.findUnique({ where: { id }, select: { userId: true, type: true } })).toEqual({
      userId: b,
      type: "FRIEND_REQUEST",
    });
    // Cadeau refusé (pas encore amis) : aucune notification, aucun rappel
    await expect(giftBoosterWith(prisma, { ...ctx(a, b), price: 10 }, (ids) => pushed.push(ids))).rejects.toBeInstanceOf(GiftError);
    expect(pushed).toHaveLength(1);
  }, 60_000);

  it("10 cadeaux simultanés avec un quota de 3 : exactement 3 passent", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    await prisma.userCard.createMany({ data: Array.from({ length: 10 }, () => ({ ownerId: a, cardId })) });
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => giftCardWith(prisma, { ...ctx(a, b), cardId, allowedRarities: ["COMMON"] })));
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    for (const r of attempts.filter((x) => x.status === "rejected")) {
      expect(((r as PromiseRejectedResult).reason as GiftError).code).toBe("SENT_LIMIT");
    }
    expect(await prisma.userCard.count({ where: { ownerId: b, cardId } })).toBe(3);
    expect(await prisma.userCard.count({ where: { ownerId: a, cardId } })).toBe(7);
  }, 60_000);

  it("le quota d'envoi compte par ami : 3 cadeaux à chacun de deux amis le même jour", async () => {
    const [a, b, c] = [await player(), await player(), await player()];
    await befriend(a, b);
    await befriend(a, c);
    await prisma.userCard.createMany({ data: Array.from({ length: 7 }, () => ({ ownerId: a, cardId })) });
    for (const to of [b, c]) {
      for (let i = 0; i < 3; i++) await giftCardWith(prisma, { ...ctx(a, to), cardId, allowedRarities: ["COMMON"] });
    }
    await expect(giftCardWith(prisma, { ...ctx(a, b), cardId, allowedRarities: ["COMMON"] })).rejects.toMatchObject({ code: "SENT_LIMIT" });
    expect(await prisma.userCard.count({ where: { ownerId: b, cardId } })).toBe(3);
    expect(await prisma.userCard.count({ where: { ownerId: c, cardId } })).toBe(3);
  }, 60_000);

  it("un même exemplaire offert deux fois en parallèle n'est transféré qu'une fois, et quitte la vitrine", async () => {
    const [a, b, c] = [await player(), await player(), await player()];
    await befriend(a, b);
    await befriend(a, c);
    await prisma.userCard.create({ data: { ownerId: a, cardId } });
    await setShowcaseWith(prisma, a, [cardId], 4);
    const attempts = await Promise.allSettled([
      giftCardWith(prisma, { ...ctx(a, b), cardId, allowedRarities: ["COMMON"] }),
      giftCardWith(prisma, { ...ctx(a, c), cardId, allowedRarities: ["COMMON"] }),
    ]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.userCard.count({ where: { ownerId: { in: [b, c] }, cardId } })).toBe(1);
    expect(await prisma.showcaseSlot.count({ where: { userId: a } })).toBe(0);
  }, 60_000);

  it("les boosters offerts gardent soldes et journal d'accord, sans dépasser le solde", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    // 4 × 300 > 1 000 Zeni et quota de 3 : au plus 3 passent, jamais de solde négatif
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => giftBoosterWith(prisma, { ...ctx(a, b), price: 300 })));
    const ok = attempts.filter((x) => x.status === "fulfilled").length;
    expect(ok).toBe(3);
    const [sender, recipient] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a }, select: { coins: true } }),
      prisma.boosterCredit.findFirst({ where: { userId: b, boosterType: { slug: "standard" } }, select: { count: true } }),
    ]);
    expect(sender.coins).toBe(START - ok * 300);
    expect(recipient?.count ?? 0).toBe(ok);
    expect(await balanceMatchesLedger(a)).toBe(true);
  }, 60_000);

  it("un blocage pendant les cadeaux les arrête", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    await blockWith(prisma, b, a);
    await expect(giftBoosterWith(prisma, { ...ctx(a, b), price: 100 })).rejects.toMatchObject({ code: "NOT_FRIENDS" });
    expect(await balanceMatchesLedger(a)).toBe(true);
  }, 60_000);
});
