import { randomBytes, randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { takeSerial } from "./printing-core";

// Numéros des éditions gravées sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/prestige/printing.db.test.ts
// Crée sa série et ses cartes, puis supprime uniquement ce qu'il a créé (les compteurs partent avec les cartes).

const url = process.env.DATABASE_URL_TEST;
const rng = (max: number) => randomInt(0, max);

describe.skipIf(!url)("numéros des gravées (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const seriesId = `test-series-${tag}`;
  const cards = Array.from({ length: 4 }, (_, i) => `test-printing-${tag}-${i}`);

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Gravées" } });
    await prisma.card.createMany({
      data: cards.map((id, i) => ({ id, name: `Gravée ${i}`, imageUrl: "", favorites: 0, power: 10, ki: 10, seriesId, searchText: `gravee ${i}`, rarity: "MYTHIC" })),
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction([prisma.card.deleteMany({ where: { id: { in: cards } } }), prisma.series.deleteMany({ where: { id: seriesId } })]);
    await prisma.$disconnect();
  }, 30_000);

  const take = (cardId: string, size = 5) =>
    prisma.$transaction((tx) => takeSerial(tx, { cardId, printing: 1, size, rng }), { maxWait: 20_000, timeout: 30_000 });

  it("50 gravures simultanées sur un tirage où il reste 3 numéros : exactement 3, tous distincts", async () => {
    await prisma.cardPrinting.create({ data: { cardId: cards[0], printing: 1, size: 5, issued: 2, taken: [4, 1] } });
    const editions = await Promise.all(Array.from({ length: 50 }, () => take(cards[0])));
    const serials = editions.flatMap((e) => (e ? [e.serial] : []));
    expect(serials.sort((a, b) => a - b)).toEqual([2, 3, 5]);
    const counter = await prisma.cardPrinting.findUniqueOrThrow({ where: { cardId_printing: { cardId: cards[0], printing: 1 } } });
    expect(counter.issued).toBe(5);
    expect([...counter.taken].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  }, 60_000);

  it("vingt premières gravures simultanées d'une carte : un seul compteur, des numéros distincts", async () => {
    const editions = await Promise.all(Array.from({ length: 20 }, () => take(cards[1], 25)));
    const serials = editions.map((e) => e!.serial);
    expect(new Set(serials).size).toBe(20);
    expect(await prisma.cardPrinting.count({ where: { cardId: cards[1] } })).toBe(1);
  }, 60_000);

  it("deux ouvertures qui gravent les mêmes cartes, prises dans l'ordre des ids : aucun interblocage", async () => {
    const both = [cards[2], cards[3]].sort();
    const open = () =>
      prisma.$transaction(async (tx) => {
        for (const cardId of both) await takeSerial(tx, { cardId, printing: 1, size: 25, rng });
      }, { maxWait: 20_000, timeout: 30_000 });
    await Promise.all(Array.from({ length: 10 }, open));
    const counters = await prisma.cardPrinting.findMany({ where: { cardId: { in: both } }, select: { issued: true } });
    expect(counters.map((c) => c.issued)).toEqual([10, 10]);
  }, 60_000);

  it("une ouverture annulée après la gravure (paiement refusé) laisse le compteur intact", async () => {
    const before = await prisma.cardPrinting.findUniqueOrThrow({ where: { cardId_printing: { cardId: cards[2], printing: 1 } } });
    await expect(
      prisma.$transaction(async (tx) => {
        await takeSerial(tx, { cardId: cards[2], printing: 1, size: 25, rng });
        throw new Error("paiement refusé");
      }),
    ).rejects.toThrow("paiement refusé");
    const after = await prisma.cardPrinting.findUniqueOrThrow({ where: { cardId_printing: { cardId: cards[2], printing: 1 } } });
    expect(after.issued).toBe(before.issued);
    expect(after.taken).toEqual(before.taken);
  }, 30_000);
});
