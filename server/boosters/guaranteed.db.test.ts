import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { buildRarityTables, type CardPool } from "@/lib/boosters/draw";
import { DEFAULT_RULES } from "@/lib/boosters/fixtures";
import { seededRng } from "@/lib/boosters/rng";
import { VARIANT_RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { createPgAdapter } from "@/server/pg-adapter";
import { openBoostersWith, type OpenType } from "./open-core";

// Booster garanti sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/boosters/guaranteed.db.test.ts
// Crée un type garanti et un joueur jetables, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;
const E = "EPIC";

describe.skipIf(!url)("booster garanti (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const draw = { ...DEFAULT_RULES, slotFloors: [E, E, E, E] };
  const rules = { draw, stock: { max: 10, ambassadorMax: 15, intervalMs: 10 * 60_000 } };
  const tables = buildRarityTables(draw.rates);
  let pool: CardPool = {};
  let rarity: Rarity | null = null;
  let type: OpenType;
  let userId = "";

  beforeAll(async () => {
    const cards = await prisma.card.findMany({ where: { status: "PUBLISHED", dropWeight: { gt: 0 } }, select: { id: true, rarity: true } });
    const byRarity: Record<Rarity, string[]> = {};
    for (const c of cards) (byRarity[c.rarity] ??= []).push(c.id);
    pool = byRarity;
    // La XR de préférence, sinon la première rareté de variante qui a des cartes dans cette base
    rarity = ["XR", ...VARIANT_RARITIES].find((r) => (byRarity[r]?.length ?? 0) > 0) ?? null;
    if (!rarity) return;
    const hex = randomBytes(4).toString("hex");
    const row = await prisma.boosterType.create({
      data: {
        slug: `test-garanti-${hex}`,
        kind: "GUARANTEED",
        family: "special",
        name: { fr: "Test garanti", en: "" },
        tagline: { fr: "Test", en: "" },
        emblem: "極",
        theme: { base: "#2E2152", dark: "#0B0817", pattern: "prisme", ink: "light" },
        slotFloors: [E, E, E, E],
        usesFreeStock: false,
        priceZeni: null,
        countsForPity: false,
        resetsPity: false,
        bonusEligible: false,
        guaranteed: rarity,
      },
    });
    type = { id: row.id, slug: row.slug, kind: "GUARANTEED", usesFreeStock: false, priceZeni: null, countsForPity: false, resetsPity: false, bonusEligible: false, includeCustom: true, guaranteed: rarity };
    const user = await prisma.user.create({ data: { username: `test-${hex}`, isGuest: true } });
    userId = user.id;
    await prisma.boosterCredit.create({ data: { userId, boosterTypeId: row.id, count: 2 } });
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.$transaction([
        prisma.userCard.deleteMany({ where: { ownerId: userId } }),
        prisma.discovery.deleteMany({ where: { userId } }),
        prisma.notablePull.deleteMany({ where: { userId } }),
        prisma.boosterOpening.deleteMany({ where: { userId } }),
        prisma.boosterCredit.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
      ]);
    }
    if (type) await prisma.boosterType.delete({ where: { id: type.id } });
    await prisma.$disconnect();
  }, 30_000);

  it("s'ouvre depuis un crédit : 4 cartes, la dernière de la rareté garantie, un crédit en moins, rien dans « En direct »", async () => {
    if (!rarity) return; // base de test sans carte de variante : rien à vérifier
    const outcome = await openBoostersWith(prisma, { userId, type, count: 1, credit: true, rules, tables, pool, rng: seededRng(9) });
    const [booster] = outcome.boosters;
    expect(booster.cards).toHaveLength(4);
    expect(booster.cards.at(-1)!.rarity).toBe(rarity);
    expect(outcome.credits).toBe(1);

    const last = await prisma.card.findUniqueOrThrow({ where: { id: booster.cards.at(-1)!.cardId }, select: { rarity: true } });
    const [credit, openings, notable] = await Promise.all([
      prisma.boosterCredit.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId, boosterTypeId: type.id } }, select: { count: true } }),
      prisma.boosterOpening.count({ where: { userId, boosterSlug: type.slug } }),
      prisma.notablePull.count({ where: { userId } }),
    ]);
    expect(last.rarity).toBe(rarity);
    expect(credit.count).toBe(1);
    expect(openings).toBe(1);
    expect(notable).toBe(0);
  }, 60_000);

  it("sans carte de sa rareté dans le pool : refusé, le crédit reste au joueur", async () => {
    if (!rarity) return;
    const empty = { ...pool, [rarity]: [] };
    await expect(
      openBoostersWith(prisma, { userId, type, count: 1, credit: true, rules, tables, pool: empty, rng: seededRng(3) }),
    ).rejects.toMatchObject({ code: "GUARANTEE_EMPTY" });
    const credit = await prisma.boosterCredit.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId, boosterTypeId: type.id } }, select: { count: true } });
    expect(credit.count).toBe(1);
  }, 60_000);
});
