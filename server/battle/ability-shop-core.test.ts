import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_BATTLE_RULES, type BattleRules } from "@/lib/battle/config";
import { baseKit } from "@/lib/battle/loadout";
import { KEYWORDS, TECHNIQUES, type Keyword, type Technique } from "@/lib/battle/types";
import { buyAbilityWith, equipWith, type BuyAbilityInput } from "./ability-shop-core";

const NOW = new Date("2026-11-06T12:00:00Z");
const rules: BattleRules = DEFAULT_BATTLE_RULES;
// Légendaire : 2 emplacements de passif
const CARD = { id: "card-1", publicId: 4242, rarity: "LEGENDARY" };
const BASE = baseKit({ anilistId: CARD.publicId, rarity: "LEGENDARY" }, rules);
const NEW_KEYWORD = KEYWORDS.find((k) => !BASE.keywords.includes(k)) as Keyword;
const NEW_TECHNIQUE = TECHNIQUES.find((t) => t !== BASE.technique) as Technique;
const PRICE = rules.abilityPrices.keywords[NEW_KEYWORD];

function setup({
  coins = 10_000,
  guest = false,
  banned = false,
  exists = true,
  copies = 1,
  card = CARD as typeof CARD | null,
  purchases = [] as { kind: string; ability: string }[],
  loadout = null as { keywords: string[]; technique: string } | null,
} = {}) {
  let balance = coins;
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("FOR UPDATE")) return exists ? [{ id: "me", isGuest: guest, bannedAt: banned ? NOW : null, createdAt: NOW, coins: balance }] : [];
    if (sql.includes('UPDATE "User"')) {
      const delta = values[0] as number;
      if (balance + delta < 0) return [];
      balance += delta;
      return [{ coins: balance }];
    }
    throw new Error(`requête inattendue : ${sql}`);
  });
  const tx = {
    $queryRaw,
    user: { findUnique: vi.fn().mockResolvedValue({ id: "me" }) },
    card: { findUnique: vi.fn().mockResolvedValue(card) },
    userCard: { count: vi.fn().mockResolvedValue(copies) },
    abilityPurchase: { findMany: vi.fn().mockResolvedValue(purchases), create: vi.fn().mockResolvedValue({ id: "purchase-1" }) },
    cardLoadout: { findUnique: vi.fn().mockResolvedValue(loadout), upsert: vi.fn(), deleteMany: vi.fn() },
    coinTransaction: { createMany: vi.fn() },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaClient;
  return { tx, db, balance: () => balance };
}

const buy = (over: Partial<BuyAbilityInput> = {}): BuyAbilityInput => ({
  userId: "me",
  cardId: CARD.id,
  kind: "KEYWORD",
  ability: NEW_KEYWORD,
  expectedPrice: PRICE,
  slot: null,
  now: NOW,
  ...over,
});

describe("achat d'une capacité", () => {
  it("débite, écrit la ligne de journal ABILITY et l'achat ensemble", async () => {
    const { db, tx, balance } = setup();
    await expect(buyAbilityWith(db, buy(), rules)).resolves.toMatchObject({ coins: 10_000 - PRICE, price: PRICE, kit: BASE });
    expect(balance()).toBe(10_000 - PRICE);
    expect(tx.abilityPurchase.create).toHaveBeenCalledWith({
      data: { userId: "me", cardId: CARD.id, kind: "KEYWORD", ability: NEW_KEYWORD, price: PRICE, createdAt: NOW },
      select: { id: true },
    });
    expect(tx.coinTransaction.createMany).toHaveBeenCalledWith({
      data: [{ userId: "me", amount: -PRICE, reason: "ABILITY", refId: CARD.id, balanceAfter: 10_000 - PRICE, createdAt: NOW }],
    });
    // Sans emplacement choisi, le kit ne change pas
    expect(tx.cardLoadout.upsert).not.toHaveBeenCalled();
  });

  it("achète et équipe dans l'emplacement choisi, champs écrits un par un", async () => {
    const { db, tx } = setup();
    const res = await buyAbilityWith(db, buy({ slot: 1 }), rules);
    const expected = [BASE.keywords[0], NEW_KEYWORD];
    expect(res.kit).toEqual({ keywords: expected, technique: BASE.technique });
    expect(tx.cardLoadout.upsert).toHaveBeenCalledWith({
      where: { userId_cardId: { userId: "me", cardId: CARD.id } },
      create: { userId: "me", cardId: CARD.id, keywords: expected, technique: BASE.technique },
      update: { keywords: expected, technique: BASE.technique },
    });
  });

  it("achète une technique et la pose à la place de l'ancienne", async () => {
    const { db, tx } = setup();
    const price = rules.abilityPrices.techniques[NEW_TECHNIQUE];
    const res = await buyAbilityWith(db, buy({ kind: "TECHNIQUE", ability: NEW_TECHNIQUE, expectedPrice: price, slot: 0 }), rules);
    expect(res.kit).toEqual({ keywords: BASE.keywords, technique: NEW_TECHNIQUE });
    expect(tx.coinTransaction.createMany.mock.calls[0][0].data[0]).toMatchObject({ amount: -price, reason: "ABILITY" });
  });

  it("une Commune achète une technique malgré l'absence d'emplacement de passif", async () => {
    const common = { ...CARD, rarity: "COMMON" };
    const base = baseKit({ anilistId: common.publicId, rarity: "COMMON" }, rules);
    const technique = TECHNIQUES.find((t) => t !== base.technique)!;
    const { db } = setup({ card: common });
    const res = await buyAbilityWith(db, buy({ kind: "TECHNIQUE", ability: technique, expectedPrice: rules.abilityPrices.techniques[technique], slot: 0 }), rules);
    expect(res.kit).toEqual({ keywords: [], technique });
  });

  type Refusal = { code: string; options: Parameters<typeof setup>[0]; input: Partial<BuyAbilityInput> };
  const refusals: Refusal[] = [
    { code: "NOT_OWNED", options: { copies: 0 }, input: {} },
    { code: "NOT_OWNED", options: { card: null }, input: {} },
    { code: "NO_SLOT", options: { card: { ...CARD, rarity: "COMMON" } }, input: {} },
    { code: "ALREADY_OWNED", options: { purchases: [{ kind: "KEYWORD", ability: NEW_KEYWORD }] }, input: {} },
    { code: "ALREADY_OWNED", options: {}, input: { ability: BASE.keywords[0], expectedPrice: rules.abilityPrices.keywords[BASE.keywords[0]] } },
    { code: "STALE", options: {}, input: { expectedPrice: PRICE - 1 } },
    { code: "NOT_ENOUGH_ZENI", options: { coins: PRICE - 1 }, input: {} },
    { code: "GUEST", options: { guest: true }, input: {} },
    { code: "BANNED", options: { banned: true }, input: {} },
    { code: "NO_USER", options: { exists: false }, input: {} },
    { code: "BAD_KIT", options: {}, input: { slot: 2 } },
  ];

  it.each(refusals)("refuse : $code", async ({ code, options, input }) => {
    const { db, tx, balance } = setup(options);
    await expect(buyAbilityWith(db, buy(input), rules)).rejects.toMatchObject({ code });
    // Rien n'est débité ; un débit refusé annule aussi l'achat (même transaction)
    expect(balance()).toBe(options?.coins ?? 10_000);
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
    expect(tx.cardLoadout.upsert).not.toHaveBeenCalled();
    if (code !== "NOT_ENOUGH_ZENI") expect(tx.abilityPurchase.create).not.toHaveBeenCalled();
  });

  it("un emplacement invalide est refusé avant tout débit", async () => {
    const { db, tx } = setup();
    await expect(buyAbilityWith(db, buy({ slot: 5 }), rules)).rejects.toMatchObject({ code: "BAD_KIT" });
    expect(tx.$queryRaw.mock.calls.some(([s]) => (s as TemplateStringsArray).join("?").includes('UPDATE "User"'))).toBe(false);
  });

  it("deux clics simultanés : la contrainte unique répond ALREADY_OWNED", async () => {
    const { db, tx } = setup();
    tx.abilityPurchase.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
    await expect(buyAbilityWith(db, buy(), rules)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
  });

  it("atelier ou combat fermé : refus sans transaction", async () => {
    for (const closed of [{ ...rules, abilityShopEnabled: false }, { ...rules, enabled: false }]) {
      const { db } = setup();
      await expect(buyAbilityWith(db, buy(), closed)).rejects.toMatchObject({ code: "DISABLED" });
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  });
});

describe("équipement gratuit", () => {
  const owned = [{ kind: "KEYWORD", ability: NEW_KEYWORD }];

  it("rééquipe une capacité achetée, sans aucun mouvement de Zeni", async () => {
    const { db, tx } = setup({ purchases: owned });
    const kit = { keywords: [NEW_KEYWORD, BASE.keywords[1]], technique: BASE.technique };
    await expect(equipWith(db, { userId: "me", cardId: CARD.id, kit }, rules)).resolves.toEqual({ kit });
    expect(tx.cardLoadout.upsert).toHaveBeenCalledWith({
      where: { userId_cardId: { userId: "me", cardId: CARD.id } },
      create: { userId: "me", cardId: CARD.id, keywords: kit.keywords, technique: kit.technique },
      update: { keywords: kit.keywords, technique: kit.technique },
    });
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
  });

  it("rééquiper le passif d'origine revient au kit tiré au sort : la ligne est effacée", async () => {
    const { db, tx } = setup({ purchases: owned, loadout: { keywords: [NEW_KEYWORD, BASE.keywords[1]], technique: BASE.technique } });
    await equipWith(db, { userId: "me", cardId: CARD.id, kit: { keywords: [BASE.keywords[1], BASE.keywords[0]], technique: BASE.technique } }, rules);
    expect(tx.cardLoadout.deleteMany).toHaveBeenCalledWith({ where: { userId: "me", cardId: CARD.id } });
    expect(tx.cardLoadout.upsert).not.toHaveBeenCalled();
  });

  it("« Revenir au kit d'origine » efface le kit sans rien rembourser", async () => {
    const { db, tx } = setup({ purchases: owned });
    await expect(equipWith(db, { userId: "me", cardId: CARD.id, kit: null }, rules)).resolves.toEqual({ kit: BASE });
    expect(tx.cardLoadout.deleteMany).toHaveBeenCalled();
    expect(tx.coinTransaction.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["une capacité non acquise", { keywords: [NEW_KEYWORD, BASE.keywords[1]], technique: BASE.technique }, []],
    ["un emplacement vide", { keywords: [BASE.keywords[0]], technique: BASE.technique }, owned],
    ["une technique non acquise", { keywords: BASE.keywords, technique: NEW_TECHNIQUE }, owned],
  ])("refuse %s (BAD_KIT), sans rien écrire", async (_, kit, purchases) => {
    const { db, tx } = setup({ purchases });
    await expect(equipWith(db, { userId: "me", cardId: CARD.id, kit }, rules)).rejects.toMatchObject({ code: "BAD_KIT" });
    expect(tx.cardLoadout.upsert).not.toHaveBeenCalled();
    expect(tx.cardLoadout.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse un joueur sans exemplaire ou invité", async () => {
    await expect(equipWith(setup({ copies: 0 }).db, { userId: "me", cardId: CARD.id, kit: null }, rules)).rejects.toMatchObject({ code: "NOT_OWNED" });
    await expect(equipWith(setup({ guest: true }).db, { userId: "me", cardId: CARD.id, kit: null }, rules)).rejects.toMatchObject({ code: "GUEST" });
  });
});
