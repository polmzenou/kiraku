import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import { abilityPrice, baseKit } from "@/lib/battle/loadout";
import { KEYWORDS, type Keyword } from "@/lib/battle/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { createPgAdapter } from "@/server/pg-adapter";
import { BattleError } from "./battle-core";
import { buyAbilityWith } from "./ability-shop-core";

// Atelier sous concurrence, sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/battle/atelier.db.test.ts
//
// Règle des 50 enchères simultanées (CLAUDE.md) appliquée à l'atelier : la somme des soldes plus les achats
// ne bouge pas, une capacité ne se paie qu'une fois, le solde reste égal à la somme du journal.

const url = process.env.DATABASE_URL_TEST;
const rules = DEFAULT_BATTLE_RULES;

function codeOf(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "OK";
  return r.reason instanceof BattleError ? r.reason.code : `UNEXPECTED: ${String(r.reason)}`;
}

describe.skipIf(!url)("atelier atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const users: string[] = [];
  let card: { id: string; publicId: number; rarity: Rarity };
  let missing: Keyword[] = [];

  /** Joueur inscrit avec `coins` Zeni (ligne SIGNUP : solde = Σ journal) et un exemplaire de la carte. */
  async function player(coins: number) {
    const user = await prisma.user.create({
      data: { username: `atelier-${randomBytes(4).toString("hex")}`, isGuest: false, coins },
      select: { id: true },
    });
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: coins, reason: "SIGNUP", balanceAfter: coins } });
    await prisma.userCard.create({ data: { ownerId: user.id, cardId: card.id } });
    users.push(user.id);
    return user.id;
  }

  async function totals(userId: string) {
    const [user, ledger, purchases] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
      prisma.abilityPurchase.aggregate({ where: { userId }, _sum: { price: true }, _count: { _all: true } }),
    ]);
    return { coins: user.coins, ledger: ledger._sum.amount ?? 0, spent: purchases._sum.price ?? 0, purchases: purchases._count._all };
  }

  const input = (userId: string, ability: Keyword) => ({
    userId,
    cardId: card.id,
    kind: "KEYWORD" as const,
    ability,
    expectedPrice: abilityPrice(rules.abilityPrices, "KEYWORD", ability),
    slot: null,
    now: new Date(),
  });

  beforeAll(async () => {
    // Une carte publiée d'une rareté qui a au moins un emplacement de passif
    const withSlots = Object.entries(rules.keywordsByRarity).filter(([, n]) => n > 0).map(([key]) => key);
    const row = await prisma.card.findFirst({
      where: { rank: { not: null }, status: "PUBLISHED", rarity: { in: withSlots } },
      orderBy: { rank: "asc" },
      select: { id: true, publicId: true, rarity: true },
    });
    if (!row) throw new Error("Catalogue vide : lance d'abord l'import");
    card = { ...row, rarity: row.rarity as Rarity };
    const base = baseKit({ anilistId: card.publicId, rarity: card.rarity }, rules);
    missing = KEYWORDS.filter((k) => !base.keywords.includes(k));
  }, 60_000);

  afterAll(async () => {
    const mine = { userId: { in: users } };
    await prisma.$transaction([
      prisma.abilityPurchase.deleteMany({ where: mine }),
      prisma.cardLoadout.deleteMany({ where: mine }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where: mine }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("20 achats simultanés de la même capacité : un seul passe, la somme des soldes et des achats ne bouge pas", async () => {
    const userId = await player(100_000);
    const ability = missing[0];
    const before = await totals(userId);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => buyAbilityWith(prisma, input(userId, ability), rules)));
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "OK")).toHaveLength(1);
    expect(codes.filter((c) => c !== "OK").every((c) => c === "ALREADY_OWNED")).toBe(true);

    const after = await totals(userId);
    expect(after.purchases).toBe(1);
    expect(after.coins + after.spent).toBe(before.coins + before.spent);
    expect(after.coins).toBe(before.coins - abilityPrice(rules.abilityPrices, "KEYWORD", ability));
    expect(after.coins).toBe(after.ledger);
    expect(await prisma.coinTransaction.count({ where: { userId, reason: "ABILITY" } })).toBe(1);
  }, 120_000);

  it("achats simultanés de capacités différentes au-delà du solde : jamais sous zéro, rien ne se perd", async () => {
    const abilities = missing.slice(0, 5);
    const prices = abilities.map((a) => abilityPrice(rules.abilityPrices, "KEYWORD", a));
    // Assez pour les deux moins chères seulement
    const sorted = [...prices].sort((a, b) => a - b);
    const userId = await player(sorted[0] + sorted[1]);
    const before = await totals(userId);
    const results = await Promise.allSettled(abilities.map((a) => buyAbilityWith(prisma, input(userId, a), rules)));
    const codes = results.map(codeOf);
    expect(codes.every((c) => c === "OK" || c === "NOT_ENOUGH_ZENI")).toBe(true);

    const after = await totals(userId);
    expect(after.coins).toBeGreaterThanOrEqual(0);
    expect(after.purchases).toBe(codes.filter((c) => c === "OK").length);
    expect(after.coins + after.spent).toBe(before.coins + before.spent);
    expect(after.coins).toBe(after.ledger);
    // Un débit refusé annule aussi la ligne d'achat
    const bought = await prisma.abilityPurchase.findMany({ where: { userId }, select: { ability: true } });
    expect(bought.map((b) => b.ability).sort()).toEqual(abilities.filter((_, i) => codes[i] === "OK").sort());
  }, 120_000);
});
