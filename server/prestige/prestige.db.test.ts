import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import { previewRebirthWith, rebirthWith, RebirthError, type RebirthCtx } from "./prestige-core";

// Renaissance sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/prestige/prestige.db.test.ts
// Crée sa rareté, sa série, ses cartes et des joueurs jetables, puis supprime uniquement ce qu'il a créé. Les
// seuils ne portent que sur la rareté du test : le reste du catalogue de la base n'entre pas en compte.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("renaissance (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const rarity = `TP${tag.toUpperCase()}`;
  const seriesId = `test-series-${tag}`;
  const cards = Array.from({ length: 4 }, (_, i) => `test-prestige-${tag}-${i}`);
  const users: string[] = [];

  const ctx = (): RebirthCtx => ({
    now: new Date(),
    rules: {
      enabled: true,
      // Seule la rareté du test compte (les autres sont absentes du réglage) : il faut toutes ses cartes
      requiredPercent: { [rarity]: 100 },
      keepSlots: 2,
      minDaysBetween: 0,
      maxCopies: 1_000,
      heritageMax: 5,
      consecrateMinOwnCycles: 1,
      zeniTiers: SETTING_DEFAULTS["prestige.zeniTiers"],
      zeniCap: SETTING_DEFAULTS["prestige.zeniCap"],
      recycleMultiplier: 5,
    },
    values: { [rarity]: 10 },
    rarityOrder: [rarity],
  });

  async function player() {
    const user = await prisma.user.create({ data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false } });
    users.push(user.id);
    return user.id;
  }

  /** Un joueur qui possède toutes les cartes du test, et `extra` doublons de la première. */
  async function collector(extra = 2) {
    const id = await player();
    await prisma.userCard.createMany({ data: [...cards, ...Array.from({ length: extra }, () => cards[0])].map((cardId) => ({ ownerId: id, cardId })) });
    return id;
  }

  async function code(run: Promise<unknown>) {
    try {
      await run;
      return null;
    } catch (e) {
      if (e instanceof RebirthError) return e.code;
      throw e;
    }
  }

  beforeAll(async () => {
    await prisma.rarityDefinition.create({ data: { key: rarity, nameFr: "Test", nameEn: "Test", sortOrder: 9_000, seal: "試" } });
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Prestige" } });
    await prisma.card.createMany({
      data: cards.map((id, i) => ({ id, name: `Carte ${i}`, imageUrl: "", favorites: 0, power: 10, ki: 10, seriesId, searchText: `carte ${i}`, rarity })),
    });
  }, 30_000);

  afterAll(async () => {
    const where = { userId: { in: users } };
    await prisma.$transaction([
      prisma.coinTransaction.deleteMany({ where }),
      prisma.prestigeCycle.deleteMany({ where }),
      prisma.discovery.deleteMany({ where }),
      prisma.auction.deleteMany({ where: { sellerId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
      prisma.rarityDefinition.deleteMany({ where: { key: rarity } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("garde les héritières, recycle le reste, verse les Zeni annoncés et passe au prestige I", async () => {
    const id = await collector(2);
    await prisma.discovery.createMany({ data: cards.map((cardId) => ({ userId: id, cardId })) });
    const keep = { copyIds: [], cardIds: [cards[1], cards[2]] };
    const preview = await previewRebirthWith(prisma, id, keep, ctx());
    // 6 exemplaires, 2 gardés : 4 partent à 10 Zeni
    expect(preview).toMatchObject({ leaving: 4, zeni: 40, engraved: [] });
    const out = await rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep, expectedZeni: 40, sacrificedEngraved: [] }, ctx());
    expect(out).toMatchObject({ prestige: 1, zeni: 40 });
    const left = await prisma.userCard.findMany({ where: { ownerId: id }, select: { cardId: true, heritage: true, keptByOwner: true } });
    expect(left.map((c) => c.cardId).sort()).toEqual([cards[1], cards[2]].sort());
    expect(left.every((c) => c.heritage === 1 && c.keptByOwner === 1)).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { prestige: true, prestigedAt: true, coins: true } });
    expect(user.prestige).toBe(1);
    expect(user.prestigedAt).not.toBeNull();
    // Solde = journal
    const ledger = await prisma.coinTransaction.aggregate({ where: { userId: id }, _sum: { amount: true } });
    expect(user.coins).toBe(ledger._sum.amount);
    // Les héritières ouvrent leur provenance ; leurs cartes sont déjà « retrouvées » dans le nouveau cycle
    expect(await prisma.userCardOwner.count({ where: { ownerId: id, via: "REBIRTH" } })).toBe(2);
    const regained = await prisma.discovery.findMany({ where: { userId: id, regainedAt: { not: null } }, select: { cardId: true } });
    expect(regained.map((d) => d.cardId).sort()).toEqual([cards[1], cards[2]].sort());
    expect(await prisma.prestigeCycle.count({ where: { userId: id, number: 1 } })).toBe(1);
  });

  it("deux renaissances simultanées : une seule passe", async () => {
    const id = await collector(0);
    const run = () => rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 40, sacrificedEngraved: [] }, ctx());
    const codes = await Promise.all([code(run()), code(run())]);
    expect(codes.filter((c) => c === null)).toHaveLength(1);
    expect(codes.filter((c) => c === "STALE")).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id }, select: { prestige: true } })).prestige).toBe(1);
  });

  it("dix renaissances simultanées de joueurs différents : dix rangs distincts", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => collector(0)));
    const outs = await Promise.all(
      ids.map((id) => rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 40, sacrificedEngraved: [] }, ctx())),
    );
    expect(new Set(outs.map((o) => o.globalRank)).size).toBe(10);
  });

  it("refuse tant qu'une carte est en vente, sans rien toucher", async () => {
    const id = await collector(1);
    const copy = await prisma.userCard.findFirstOrThrow({ where: { ownerId: id }, select: { id: true } });
    await prisma.userCard.update({ where: { id: copy.id }, data: { status: "AUCTION" } });
    expect(await code(rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 40, sacrificedEngraved: [] }, ctx()))).toBe("BUSY");
    expect(await prisma.userCard.count({ where: { ownerId: id } })).toBe(5);
  });

  it("un récapitulatif périmé annule tout", async () => {
    const id = await collector(1);
    expect(await code(rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 41, sacrificedEngraved: [] }, ctx()))).toBe("STALE");
    expect(await prisma.userCard.count({ where: { ownerId: id } })).toBe(5);
    expect((await prisma.user.findUniqueOrThrow({ where: { id }, select: { prestige: true } })).prestige).toBe(0);
  });

  it("une gravée qui part doit avoir été confirmée", async () => {
    const id = await collector(0);
    const engraved = await prisma.userCard.create({ data: { ownerId: id, cardId: cards[3], printing: 1, serial: 999 }, select: { id: true } });
    const base = { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] } };
    // 4 ordinaires à 10, une gravée à 10 × 5
    expect(await code(rebirthWith(prisma, { ...base, expectedZeni: 90, sacrificedEngraved: [] }, ctx()))).toBe("STALE");
    const out = await rebirthWith(prisma, { ...base, expectedZeni: 90, sacrificedEngraved: [engraved.id] }, ctx());
    expect(out.zeni).toBe(90);
  });

  it("refuse un joueur qui n'a pas toutes les cartes exigées", async () => {
    const id = await player();
    await prisma.userCard.create({ data: { ownerId: id, cardId: cards[0] } });
    expect(await code(rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 0, sacrificedEngraved: [] }, ctx()))).toBe("NOT_ELIGIBLE");
  });
});
