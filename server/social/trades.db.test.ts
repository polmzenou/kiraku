import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { RARITIES } from "@/lib/catalog/rarity";
import { pairKey } from "@/lib/social/relation";
import type { TradeRules } from "@/lib/social/trades";
import { createPgAdapter } from "@/server/pg-adapter";
import { giftCardWith } from "./gift-core";
import { acceptTradeWith, proposeTradeWith } from "./trade-core";

// Concurrence des échanges sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/social/trades.db.test.ts
// Les joueurs jetables sont supprimés à la fin (leurs cartes, échanges et notifications partent en cascade).

const url = process.env.DATABASE_URL_TEST;
const OLD = new Date(Date.now() - 30 * 86_400_000);
const rules: TradeRules = { expiryHours: 48, maxOffered: 5, maxPendingSent: 10, perDay: 20, allowedRarities: [...RARITIES], nonFriends: true };

describe.skipIf(!url)("échanges atomiques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const ids: string[] = [];
  let cards: string[] = [];

  async function player(privacy: { profileVisibility?: "PUBLIC" | "FRIENDS" | "PRIVATE"; showCollection?: boolean } = {}) {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins: 0, createdAt: OLD, profileVisibility: "PUBLIC", ...privacy },
    });
    ids.push(user.id);
    return user.id;
  }

  async function befriend(a: string, b: string) {
    await prisma.friendship.create({
      data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", createdAt: OLD, acceptedAt: OLD },
    });
  }

  const give = (ownerId: string, cardId: string) => prisma.userCard.create({ data: { ownerId, cardId } });
  const owned = (ownerId: string, cardId: string) => prisma.userCard.count({ where: { ownerId, cardId } });

  beforeAll(async () => {
    const rows = await prisma.card.findMany({ where: { rarity: "COMMON", rank: { not: null } }, select: { id: true }, take: 3 });
    if (rows.length < 3) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    cards = rows.map((r) => r.id);
  }, 30_000);

  afterAll(async () => {
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }, 30_000);

  it("échange les deux exemplaires et prévient le proposant", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    const [wanted, offer1, offer2] = cards;
    await give(b, wanted);
    await give(a, offer1);
    await give(a, offer2);

    const { tradeId } = await proposeTradeWith(prisma, { proposerId: a, recipientId: b, wantedCardId: wanted, offeredCardIds: [offer1, offer2], rules });
    const res = await acceptTradeWith(prisma, { userId: b, tradeId, chosenCardId: offer2, allowedRarities: rules.allowedRarities, nonFriendsAllowed: true });

    expect(res).toMatchObject({ ok: true, received: { cardId: offer2 } });
    expect(await owned(a, wanted)).toBe(1);
    expect(await owned(b, offer2)).toBe(1);
    expect(await owned(a, offer2)).toBe(0);
    expect(await owned(a, offer1)).toBe(1); // la carte non choisie reste au proposant
    const notif = await prisma.notification.findFirst({ where: { userId: a, type: "TRADE_ACCEPTED", refId: tradeId } });
    expect(notif).not.toBeNull();
  }, 60_000);

  it("deux acceptations simultanées : un seul échange, aucune carte dupliquée", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    const [wanted, offer] = cards;
    await give(b, wanted);
    await give(a, offer);
    const { tradeId } = await proposeTradeWith(prisma, { proposerId: a, recipientId: b, wantedCardId: wanted, offeredCardIds: [offer], rules });

    const results = await Promise.allSettled([
      acceptTradeWith(prisma, { userId: b, tradeId, chosenCardId: offer, allowedRarities: rules.allowedRarities, nonFriendsAllowed: true }),
      acceptTradeWith(prisma, { userId: b, tradeId, chosenCardId: offer, allowedRarities: rules.allowedRarities, nonFriendsAllowed: true }),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(succeeded).toHaveLength(1);
    expect((await owned(a, wanted)) + (await owned(b, wanted))).toBe(1);
    expect((await owned(a, offer)) + (await owned(b, offer))).toBe(1);
  }, 60_000);

  it("une carte offerte ailleurs entre-temps : l'échange échoue proprement", async () => {
    const [a, b, c] = [await player(), await player(), await player()];
    await befriend(a, b);
    await befriend(a, c);
    const [wanted, offer] = cards;
    await give(b, wanted);
    await give(a, offer);
    const { tradeId } = await proposeTradeWith(prisma, { proposerId: a, recipientId: b, wantedCardId: wanted, offeredCardIds: [offer], rules });

    const giftRules = { enabled: true, perDaySent: 3, perDayReceived: 5, minAccountAgeHours: 0, minFriendshipHours: 0 };
    const [gift, accept] = await Promise.allSettled([
      giftCardWith(prisma, { senderId: a, recipientId: c, cardId: offer, rules: giftRules, timeZone: "Europe/Paris", allowedRarities: [...RARITIES] }),
      acceptTradeWith(prisma, { userId: b, tradeId, chosenCardId: offer, allowedRarities: rules.allowedRarities, nonFriendsAllowed: true }),
    ]);
    const traded = accept.status === "fulfilled" && accept.value.ok;
    const gifted = gift.status === "fulfilled";
    expect(Number(traded) + Number(gifted)).toBe(1);
    // L'unique exemplaire n'existe qu'une fois, chez l'un ou l'autre
    expect((await owned(a, offer)) + (await owned(b, offer)) + (await owned(c, offer))).toBe(1);
    if (!traded) {
      const trade = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId }, select: { status: true } });
      expect(trade.status).toBe("FAILED");
      expect(await owned(b, wanted)).toBe(1);
    }
  }, 60_000);

  it("entre non-amis : échange possible quand la collection est publique", async () => {
    const [a, b] = [await player(), await player({ showCollection: true })];
    const [wanted, offer] = cards;
    await give(b, wanted);
    await give(a, offer);
    const { tradeId } = await proposeTradeWith(prisma, { proposerId: a, recipientId: b, wantedCardId: wanted, offeredCardIds: [offer], rules });
    const res = await acceptTradeWith(prisma, { userId: b, tradeId, chosenCardId: offer, allowedRarities: rules.allowedRarities, nonFriendsAllowed: true });
    expect(res).toMatchObject({ ok: true, received: { cardId: offer } });
    expect(await owned(a, wanted)).toBe(1);
  }, 60_000);

  it("entre non-amis : refusé si la collection est cachée, ou si le réglage est refermé", async () => {
    const [a, hidden, open] = [await player(), await player({ showCollection: false }), await player({ showCollection: true })];
    const [wanted, offer] = cards;
    await give(hidden, wanted);
    await give(open, wanted);
    await give(a, offer);
    await expect(
      proposeTradeWith(prisma, { proposerId: a, recipientId: hidden, wantedCardId: wanted, offeredCardIds: [offer], rules }),
    ).rejects.toMatchObject({ code: "PRIVATE" });
    const { tradeId } = await proposeTradeWith(prisma, { proposerId: a, recipientId: open, wantedCardId: wanted, offeredCardIds: [offer], rules });
    await expect(
      acceptTradeWith(prisma, { userId: open, tradeId, chosenCardId: offer, allowedRarities: rules.allowedRarities, nonFriendsAllowed: false }),
    ).rejects.toMatchObject({ code: "NOT_FRIENDS" });
  }, 60_000);
});
