import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import { redeemVoucherWith, VoucherError } from "./voucher-core";

vi.mock("server-only", () => ({}));

// Bons du parrainage sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/voucher.db.test.ts
// « Mythique au choix » : une Mythique publiée, une seule fois, même lancé cinq fois en même temps. Carte 1/1 : trois
// joueurs choisissent la même carte en même temps, un seul la reçoit (numéro 1 sur 1 du tirage 1000), les deux autres
// gardent leur bon. Crée ses joueurs, sa série et ses cartes, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("bons du parrainage (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const seriesId = `test-series-bons-${tag}`;
  const card = {
    mythic: `test-bon-${tag}-mythic`,
    legendary: `test-bon-${tag}-legendary`,
    archived: `test-bon-${tag}-archived`,
    one: `test-bon-${tag}-one`,
    other: `test-bon-${tag}-other`,
  };
  const users: Record<"a" | "b" | "c", string> = { a: "", b: "", c: "" };

  const voucher = async (userId: string, kind: "MYTHIC_CHOICE" | "ONE_OF_ONE") => (await prisma.voucher.create({ data: { userId, kind }, select: { id: true } })).id;
  const redeem = (userId: string, voucherId: string, cardId: string) => redeemVoucherWith(prisma, { userId, voucherId, cardId, now: new Date() });
  /** Issue d'un choix : « OK » ou le code de l'erreur. */
  const outcome = (p: Promise<unknown>) => p.then(() => "OK", (e: unknown) => (e instanceof VoucherError ? e.code : String(e)));

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Bons" } });
    const rows: [string, string, "PUBLISHED" | "ARCHIVED"][] = [
      [card.mythic, "MYTHIC", "PUBLISHED"],
      [card.legendary, "LEGENDARY", "PUBLISHED"],
      [card.archived, "MYTHIC", "ARCHIVED"],
      [card.one, "COMMON", "PUBLISHED"],
      [card.other, "EPIC", "PUBLISHED"],
    ];
    await prisma.card.createMany({
      // Statut fixé par l'admin : rien ne le change pendant le test
      data: rows.map(([id, rarity, status], i) => ({ id, name: `Bon ${i}`, imageUrl: "", favorites: 0, power: 10, ki: 10, seriesId, searchText: `bon ${i}`, rarity, status, adminOverrides: ["status"] })),
    });
    for (const name of ["a", "b", "c"] as const) {
      users[name] = (await prisma.user.create({ data: { username: `test-bon-${name}-${tag}`, isGuest: false }, select: { id: true } })).id;
    }
  }, 30_000);

  afterAll(async () => {
    const ids = Object.values(users).filter(Boolean);
    await prisma.$transaction([
      prisma.voucher.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: ids } } }),
      prisma.discovery.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
      prisma.card.deleteMany({ where: { id: { in: Object.values(card) } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("Mythique au choix : une Mythique publiée, au joueur du bon, une seule fois", async () => {
    const v = await voucher(users.a, "MYTHIC_CHOICE");
    expect(await outcome(redeem(users.a, v, card.legendary))).toBe("NOT_MYTHIC");
    expect(await outcome(redeem(users.a, v, card.archived))).toBe("CARD_UNAVAILABLE");
    expect(await outcome(redeem(users.b, v, card.mythic))).toBe("NOT_FOUND");
    const done = await redeem(users.a, v, card.mythic);
    expect(done).toMatchObject({ kind: "MYTHIC_CHOICE", cardId: card.mythic, edition: null, isNew: true });
    const row = await prisma.voucher.findUniqueOrThrow({ where: { id: v }, select: { usedAt: true, cardId: true, userCardId: true } });
    expect(row).toMatchObject({ cardId: card.mythic, userCardId: done.userCardId });
    expect(row.usedAt).not.toBeNull();
    const copy = await prisma.userCard.findUniqueOrThrow({ where: { id: done.userCardId }, select: { ownerId: true, printing: true, serial: true } });
    expect(copy).toEqual({ ownerId: users.a, printing: null, serial: null });
    expect(await prisma.discovery.count({ where: { userId: users.a, cardId: card.mythic } })).toBe(1);
    expect(await outcome(redeem(users.a, v, card.mythic))).toBe("USED");
  });

  it("le même bon lancé cinq fois en même temps : une seule carte", async () => {
    const v = await voucher(users.a, "MYTHIC_CHOICE");
    const results = await Promise.all(Array.from({ length: 5 }, () => outcome(redeem(users.a, v, card.mythic))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "USED")).toHaveLength(4);
    // Le double de la Mythique du premier test, et rien de plus
    expect(await prisma.userCard.count({ where: { ownerId: users.a, cardId: card.mythic } })).toBe(2);
  });

  it("trois joueurs prennent la 1/1 de la même carte en même temps : un seul l'a, les autres gardent leur bon", async () => {
    const vouchers = { a: await voucher(users.a, "ONE_OF_ONE"), b: await voucher(users.b, "ONE_OF_ONE"), c: await voucher(users.c, "ONE_OF_ONE") };
    const players = ["a", "b", "c"] as const;
    const results = await Promise.all(players.map((p) => outcome(redeem(users[p], vouchers[p], card.one))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "CARD_TAKEN")).toHaveLength(2);

    const copies = await prisma.userCard.findMany({ where: { cardId: card.one }, select: { id: true, ownerId: true, printing: true, serial: true } });
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ ownerId: users[players[results.indexOf("OK")]], printing: 1000, serial: 1 });
    const counter = await prisma.cardPrinting.findUniqueOrThrow({ where: { cardId_printing: { cardId: card.one, printing: 1000 } }, select: { size: true, issued: true, taken: true } });
    expect(counter).toEqual({ size: 1, issued: 1, taken: [1] });
    // Provenance de la 1/1 : son premier propriétaire
    expect(await prisma.userCardOwner.findMany({ where: { userCardId: copies[0].id }, select: { ownerId: true, via: true } })).toEqual([{ ownerId: copies[0].ownerId, via: "GIFT" }]);

    // Les perdants gardent leur bon : il sert encore, sur une autre carte
    const losers = players.filter((_, i) => results[i] === "CARD_TAKEN");
    for (const p of losers) expect((await prisma.voucher.findUniqueOrThrow({ where: { id: vouchers[p] }, select: { usedAt: true } })).usedAt).toBeNull();
    expect(await outcome(redeem(users[losers[0]], vouchers[losers[0]], card.one))).toBe("CARD_TAKEN");
    const second = await redeem(users[losers[0]], vouchers[losers[0]], card.other);
    expect(second.edition).toEqual({ printing: 1000, serial: 1, size: 1 });
  });
});
