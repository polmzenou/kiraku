import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { buildRarityTables, type CardPool } from "@/lib/boosters/draw";
import { DEFAULT_RULES } from "@/lib/boosters/fixtures";
import { seededRng } from "@/lib/boosters/rng";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { createPgAdapter } from "@/server/pg-adapter";
import { openBoostersWith, type OpenType } from "../boosters/open-core";
import { deleteFrescoWith, FrescoAdminError, setFrescoStatusWith } from "./admin-core";
import type { FrescoDropInput } from "./award-core";

// Fresques sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/fresco/fresco.db.test.ts
// Crée un joueur, une série, des cartes, des lots et une fresque jetables, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("fresques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const rules = { draw: DEFAULT_RULES, stock: { max: 40, ambassadorMax: 40, intervalMs: 10 * 60_000 } };
  const tables = buildRarityTables(DEFAULT_RULES.rates);
  const type: OpenType = {
    id: `test-fresco-${tag}`,
    slug: "standard",
    kind: "STANDARD",
    usesFreeStock: true,
    priceZeni: null,
    countsForPity: true,
    resetsPity: true,
    bonusEligible: false,
    includeCustom: true,
    guaranteed: null,
  };
  let pool: CardPool;
  let userId = "";
  let seriesId = "";
  let frescoId = "";
  let adminId = "";
  const lotIds: string[] = [];
  let drop: FrescoDropInput;

  beforeAll(async () => {
    const series = await prisma.series.create({ data: { type: "ANIME", titleRomaji: `Série ${tag}`, genres: [], tags: [] } });
    seriesId = series.id;
    const cards = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.card.create({
          data: {
            name: `Carte ${tag} ${i}`,
            origin: "CUSTOM",
            status: "PUBLISHED",
            adminOverrides: ["status"],
            imageUrl: "/icons/icon-512.png",
            favorites: 0,
            rarity: "COMMON",
            power: 50,
            ki: 50,
            seriesId,
            searchText: `carte ${tag} ${i}`,
          },
          select: { id: true },
        }),
      ),
    );
    pool = Object.fromEntries(RARITIES.map((r) => [r, r === "COMMON" ? cards.map((c) => c.id) : []])) as Record<Rarity, string[]>;
    const [user, admin] = await Promise.all([
      prisma.user.create({ data: { username: `fr-${tag}`, isGuest: true, boosterStock: 40, coins: 0 } }),
      prisma.user.create({ data: { username: `fra-${tag}`, isGuest: false, role: "ADMIN" } }),
    ]);
    userId = user.id;
    adminId = admin.id;
    // Un lot par récompense, chacun avec ses Zeni : le solde dit ce qui a été versé
    for (const zeni of [5, 100, 50, 1000]) {
      const lot = await prisma.lot.create({ data: { name: { fr: `Lot ${zeni}`, en: "" }, zeni }, select: { id: true } });
      lotIds.push(lot.id);
    }
    const fresco = await prisma.fresco.create({
      data: {
        name: { fr: `Fresque ${tag}`, en: "" },
        imageUrl: "https://example.test/full.webp",
        pieceLotId: lotIds[0],
        rowLotId: lotIds[1],
        columnLotId: lotIds[2],
        completeLotId: lotIds[3],
        pieces: { create: Array.from({ length: 12 }, (_, position) => ({ position, imageUrl: `https://example.test/${position}.webp` })) },
      },
      select: { id: true },
    });
    frescoId = fresco.id;
    drop = {
      sources: [{ id: frescoId, grid: { cols: 4, rows: 3 }, weight: 1, boosterTypeIds: [], lots: { PIECE: lotIds[0], ROW: lotIds[1], COLUMN: lotIds[2], COMPLETE: lotIds[3] } }],
      rate: 10_000,
      rng: seededRng(7),
      lotDeps: { rng: seededRng(8), loadPool: async () => pool },
    };
  }, 60_000);

  afterAll(async () => {
    if (userId) {
      await prisma.frescoReward.deleteMany({ where: { userId } });
      await prisma.userFrescoPiece.deleteMany({ where: { userId } });
      await prisma.userCard.deleteMany({ where: { ownerId: userId } });
      await prisma.discovery.deleteMany({ where: { userId } });
      await prisma.boosterOpening.deleteMany({ where: { userId } });
      await prisma.coinTransaction.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    if (frescoId) await prisma.fresco.deleteMany({ where: { id: frescoId } });
    if (lotIds.length) await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
    if (adminId) {
      await prisma.adminLog.deleteMany({ where: { adminId } });
      await prisma.user.delete({ where: { id: adminId } });
    }
    if (seriesId) {
      await prisma.card.deleteMany({ where: { seriesId } });
      await prisma.series.delete({ where: { id: seriesId } });
    }
    await prisma.$disconnect();
  }, 60_000);

  const open = (count: number, seed: number, fresco: FrescoDropInput | null = drop) =>
    openBoostersWith(prisma, { userId, type, count, rules, tables, pool, rng: seededRng(seed), fresco });

  it("une fresque en brouillon ne se publie pas sans tous ses fragments", async () => {
    const empty = await prisma.fresco.create({ data: { name: { fr: `Vide ${tag}`, en: "" } }, select: { id: true } });
    await expect(setFrescoStatusWith(prisma, adminId, empty.id, "PUBLISHED")).rejects.toMatchObject({ code: "INCOMPLETE" });
    await deleteFrescoWith(prisma, adminId, empty.id);
    await setFrescoStatusWith(prisma, adminId, frescoId, "PUBLISHED");
    const row = await prisma.fresco.findUniqueOrThrow({ where: { id: frescoId }, select: { status: true, publishedAt: true } });
    expect(row.status).toBe("PUBLISHED");
    expect(row.publishedAt).not.toBeNull();
  });

  it("chaque booster donne un fragment manquant, sans doublon, avec ses lots versés une fois", async () => {
    // 12 boosters en trois ouvertures : un fragment chacun, tous différents
    const outcomes = [await open(5, 1), await open(5, 2), await open(2, 3)];
    const pieces = outcomes.flatMap((o) => o.boosters.map((b) => b.fresco?.position));
    expect(pieces.every((p) => p !== undefined)).toBe(true);
    expect(new Set(pieces).size).toBe(12);

    const [owned, rewards, user, ledger] = await Promise.all([
      prisma.userFrescoPiece.count({ where: { userId, frescoId } }),
      prisma.frescoReward.groupBy({ by: ["kind"], where: { userId, frescoId }, _count: { _all: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true }, _count: true }),
    ]);
    expect(owned).toBe(12);
    expect(Object.fromEntries(rewards.map((r) => [r.kind, r._count._all]))).toEqual({ PIECE: 12, ROW: 3, COLUMN: 4, COMPLETE: 1 });
    // 12 × 5 + 3 lignes × 100 + 4 colonnes × 50 + 1 000 pour la fresque complète
    expect(user.coins).toBe(12 * 5 + 3 * 100 + 4 * 50 + 1000);
    expect(ledger._sum.amount).toBe(user.coins);
    expect(ledger._count).toBe(12 + 3 + 4 + 1);
    // Le solde renvoyé par la dernière ouverture est déjà celui d'après les lots
    expect(outcomes[2].coins).toBe(user.coins);
  });

  it("une fresque complète ne tombe plus pour ce joueur", async () => {
    const outcome = await open(3, 4);
    expect(outcome.boosters.every((b) => !b.fresco)).toBe(true);
    expect(outcome.frescoGrants).toEqual([]);
  });

  it("une fresque distribuée ne se supprime pas", async () => {
    await setFrescoStatusWith(prisma, adminId, frescoId, "ARCHIVED");
    await expect(deleteFrescoWith(prisma, adminId, frescoId)).rejects.toBeInstanceOf(FrescoAdminError);
  });
});
