import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { buildRarityTables, type CardPool } from "@/lib/boosters/draw";
import { DEFAULT_RUIN, DEFAULT_RULES } from "@/lib/boosters/fixtures";
import { seededRng } from "@/lib/boosters/rng";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { pairKey } from "@/lib/social/relation";
import { createPgAdapter } from "@/server/pg-adapter";
import { GiftError, giftSealedWith, type GiftContext } from "../social/gift-core";
import { OpenError, openSealedWith } from "./open-core";

// Sachets scellés sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/boosters/sealed.db.test.ts
// Crée des joueurs et un type de sachet jetables, puis supprime uniquement ce qu'ils ont créé.

const url = process.env.DATABASE_URL_TEST;
const OLD = new Date(Date.now() - 30 * 86_400_000);
const giftRules = { enabled: true, perDaySent: 10, perDayReceived: 10, minAccountAgeHours: 48, minFriendshipHours: 24 };
const sealedRules = { requiresDiscord: true, minAccountDays: 7, perWeek: 5 };

describe.skipIf(!url)("sachets scellés atomiques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const ids: string[] = [];
  const rules = { draw: DEFAULT_RULES, ruin: DEFAULT_RUIN };
  const tables = buildRarityTables(DEFAULT_RULES.rates);
  let pool: CardPool;
  let type: { id: string; slug: string };

  async function player() {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, createdAt: OLD },
    });
    // Compte lié à Discord : garde-fou des sachets offerts
    await prisma.account.create({
      data: { userId: user.id, type: "oauth", provider: "discord", providerAccountId: `test-${randomBytes(6).toString("hex")}` },
    });
    ids.push(user.id);
    return user.id;
  }

  async function befriend(a: string, b: string) {
    await prisma.friendship.create({
      data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", createdAt: OLD, acceptedAt: OLD },
    });
  }

  /** Sachet tombé d'un tirage (offrable une fois). */
  async function drop(ownerId: string) {
    const row = await prisma.sealedDrop.create({ data: { ownerId, boosterTypeId: type.id, source: "DRAW", giftable: true } });
    return row.id;
  }

  const ctx = (senderId: string, recipientId: string, dropId: string): GiftContext & { dropId: string; sealedRules: typeof sealedRules } => ({
    senderId,
    recipientId,
    rules: giftRules,
    timeZone: "Europe/Paris",
    dropId,
    sealedRules,
  });

  const open = (userId: string, dropId: string, seed: number) =>
    openSealedWith(prisma, { userId, dropId, kind: "apocalypse", type, rules, tables, pool, rng: seededRng(seed) });

  beforeAll(async () => {
    const cards = await prisma.card.findMany({ where: { rank: { not: null }, status: "PUBLISHED", dropWeight: 1, origin: { not: "CUSTOM" } }, select: { id: true, rarity: true } });
    if (cards.length === 0) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    const byRarity = {} as Record<Rarity, string[]>;
    for (const r of RARITIES) byRarity[r] = [];
    for (const c of cards) (byRarity[c.rarity as Rarity] ??= []).push(c.id);
    pool = byRarity;
    const slug = `test-sachet-${randomBytes(4).toString("hex")}`;
    type = await prisma.boosterType.create({
      data: {
        slug,
        kind: "DROP",
        family: "special",
        name: { fr: "Test" },
        tagline: { fr: "Test" },
        emblem: "滅",
        theme: { base: "#4A0F0B", dark: "#0E0505", pattern: "kumo", ink: "light" },
        slotFloors: [],
        usesFreeStock: false,
        priceZeni: null,
        countsForPity: false,
        bonusEligible: false,
        featuredCardIds: [],
        poolCardIds: [],
        active: false,
      },
      select: { id: true, slug: true },
    });
  }, 30_000);

  afterAll(async () => {
    if (ids.length > 0) {
      const where = { userId: { in: ids } };
      await prisma.$transaction([
        prisma.notification.deleteMany({ where }),
        prisma.gift.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } }),
        prisma.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } }),
        prisma.sealedDrop.deleteMany({ where: { ownerId: { in: ids } } }),
        prisma.notablePull.deleteMany({ where }),
        prisma.boosterOpening.deleteMany({ where }),
        prisma.discovery.deleteMany({ where }),
        prisma.userCard.deleteMany({ where: { ownerId: { in: ids } } }),
        prisma.account.deleteMany({ where }),
        prisma.user.deleteMany({ where: { id: { in: ids } } }),
      ]);
    }
    if (type) await prisma.boosterType.delete({ where: { id: type.id } });
    await prisma.$disconnect();
  }, 30_000);

  it("deux ouvertures simultanées du même sachet : une seule passe", async () => {
    const a = await player();
    const id = await drop(a);
    const attempts = await Promise.allSettled([open(a, id, 1), open(a, id, 2)]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = attempts.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(OpenError);
    expect((refused.reason as OpenError).code).toBe("NO_BOOSTER");
    const [openings, row, user] = await Promise.all([
      prisma.boosterOpening.count({ where: { userId: a, sealedDropId: id } }),
      prisma.sealedDrop.findUniqueOrThrow({ where: { id }, select: { openedAt: true, openingId: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: a }, select: { apocalypseKarma: true } }),
    ]);
    expect(openings).toBe(1);
    expect(row.openedAt).not.toBeNull();
    expect(row.openingId).not.toBeNull();
    expect(user.apocalypseKarma).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("cadeau et ouverture simultanés : une seule des deux opérations aboutit", async () => {
    const [a, b] = [await player(), await player()];
    await befriend(a, b);
    const id = await drop(a);
    const [gift, opened] = await Promise.allSettled([giftSealedWith(prisma, ctx(a, b, id)), open(a, id, 3)]);
    expect([gift.status, opened.status].filter((s) => s === "fulfilled")).toHaveLength(1);
    const row = await prisma.sealedDrop.findUniqueOrThrow({ where: { id }, select: { ownerId: true, openedAt: true } });
    if (gift.status === "fulfilled") expect(row).toMatchObject({ ownerId: b, openedAt: null });
    else expect(row).toMatchObject({ ownerId: a });
  }, 60_000);

  it("un sachet reçu ne se ré-offre pas, et son ouverture prévient celui qui l'a offert", async () => {
    const [a, b, c] = [await player(), await player(), await player()];
    await befriend(a, b);
    await befriend(b, c);
    const id = await drop(a);
    await giftSealedWith(prisma, ctx(a, b, id));

    await expect(giftSealedWith(prisma, ctx(b, c, id))).rejects.toMatchObject({ code: "NOT_GIFTABLE" });
    await expect(giftSealedWith(prisma, ctx(a, b, id))).rejects.toBeInstanceOf(GiftError);

    const { booster } = await open(b, id, 4);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: a, type: "SEALED_OPENED" }, select: { actorId: true, refId: true, payload: true } });
    expect(note.actorId).toBe(b);
    expect(note.refId).toBe(booster.id);
    expect(note.payload).toMatchObject({ slug: "apocalypse", outcome: booster.apocalypse });
  }, 60_000);
});
