import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import { consecrateWith, ConsecrateError } from "./consecrate-core";
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
  // Booster offert à la renaissance, et un sachet scellé (jamais crédité)
  const boosterSlug = `test-prestige-${tag}`;
  const sealedSlug = `test-prestige-scelle-${tag}`;
  let boosterTypeId = "";
  const users: string[] = [];

  const ctx = (booster = { slug: boosterSlug, count: 1 }, rules: Partial<RebirthCtx["rules"]> = {}): RebirthCtx => ({
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
      ...rules,
    },
    values: { [rarity]: 10 },
    rarityOrder: [rarity],
    booster,
  });

  const credits = async (userId: string) =>
    (await prisma.boosterCredit.findUnique({ where: { userId_boosterTypeId: { userId, boosterTypeId } }, select: { count: true } }))?.count ?? 0;

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
      // Statut fixé par l'admin : sans rang, le déclencheur catalog_sync_card_identity archiverait ces cartes AniList
      data: cards.map((id, i) => ({ id, name: `Carte ${i}`, imageUrl: "", favorites: 0, power: 10, ki: 10, seriesId, searchText: `carte ${i}`, rarity, adminOverrides: ["status"] })),
    });
    const type = (slug: string, kind: "STANDARD" | "DROP") =>
      prisma.boosterType.create({
        data: { slug, kind, family: "special", name: { fr: "Test" }, tagline: { fr: "Test" }, emblem: "試", theme: {}, slotFloors: [], featuredCardIds: [], poolCardIds: [], active: false },
        select: { id: true },
      });
    boosterTypeId = (await type(boosterSlug, "STANDARD")).id;
    await type(sealedSlug, "DROP");
  }, 30_000);

  afterAll(async () => {
    const where = { userId: { in: users } };
    await prisma.$transaction([
      prisma.coinTransaction.deleteMany({ where }),
      prisma.boosterCredit.deleteMany({ where }),
      prisma.prestigeCycle.deleteMany({ where }),
      prisma.discovery.deleteMany({ where }),
      prisma.auction.deleteMany({ where: { sellerId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
      prisma.rarityDefinition.deleteMany({ where: { key: rarity } }),
      prisma.boosterType.deleteMany({ where: { slug: { in: [boosterSlug, sealedSlug] } } }),
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
    // Le nouveau cycle commence avec le booster offert, gardé dans la photo du cycle
    expect(out.boosters).toEqual({ slug: boosterSlug, count: 1 });
    expect(await credits(id)).toBe(1);
    expect((await prisma.prestigeCycle.findFirstOrThrow({ where: { userId: id, number: 1 }, select: { boosters: true } })).boosters).toEqual({ slug: boosterSlug, count: 1 });
  });

  it("une héritière d'un cycle passé qui part doit avoir été nommée et confirmée", async () => {
    const id = await collector(0);
    const heir = await prisma.userCard.findFirstOrThrow({ where: { ownerId: id, cardId: cards[0] }, select: { id: true } });
    await prisma.userCard.update({ where: { id: heir.id }, data: { heritage: 2 } });
    const keep = { copyIds: [], cardIds: [] };
    expect((await previewRebirthWith(prisma, id, keep, ctx())).heirs).toEqual([{ id: heir.id, cardId: cards[0], heritage: 2 }]);
    const base = { userId: id, expectedPrestige: 0, keep, expectedZeni: 40, sacrificedEngraved: [] };
    expect(await code(rebirthWith(prisma, { ...base, sacrificedHeirs: [] }, ctx()))).toBe("STALE");
    expect(await prisma.userCard.count({ where: { ownerId: id } })).toBe(4);
    expect((await rebirthWith(prisma, { ...base, sacrificedHeirs: [heir.id] }, ctx())).zeni).toBe(40);
  });

  it("carte cochée sans exemplaire ordinaire ou cochée deux fois : KEEP_INVALID, qui nomme la carte", async () => {
    const id = await collector(0);
    await prisma.userCard.updateMany({ where: { ownerId: id, cardId: cards[1] }, data: { heritage: 1 } });
    const err = await previewRebirthWith(prisma, id, { copyIds: [], cardIds: [cards[1], cards[2]] }, ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RebirthError);
    expect(err).toMatchObject({ code: "KEEP_INVALID", cardIds: [cards[1]] });
    expect(await code(previewRebirthWith(prisma, id, { copyIds: [], cardIds: [cards[2], cards[2]] }, ctx()))).toBe("KEEP_INVALID");
  });

  it("plafond d'héritage abaissé sous l'héritage acquis : l'héritière reprise ne perd rien", async () => {
    const id = await collector(0);
    const heir = await prisma.userCard.findFirstOrThrow({ where: { ownerId: id, cardId: cards[0] }, select: { id: true } });
    await prisma.userCard.update({ where: { id: heir.id }, data: { heritage: 4 } });
    const lowered = ctx(undefined, { heritageMax: 3 });
    const keep = { copyIds: [heir.id], cardIds: [] };
    expect(await previewRebirthWith(prisma, id, keep, lowered)).toMatchObject({ leaving: 3, zeni: 30, heirs: [] });
    const out = await rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep, expectedZeni: 30, sacrificedEngraved: [], sacrificedHeirs: [] }, lowered);
    expect(out.heirs).toMatchObject([{ userCardId: heir.id, before: 4, after: 4 }]);
    expect((await prisma.userCard.findUniqueOrThrow({ where: { id: heir.id }, select: { heritage: true } })).heritage).toBe(4);
  });

  it("collection au-delà de prestige.maxCopies : TOO_MANY, sans rien toucher", async () => {
    const id = await collector(2);
    expect(await code(rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 60, sacrificedEngraved: [] }, ctx(undefined, { maxCopies: 5 })))).toBe(
      "TOO_MANY",
    );
    expect(await prisma.userCard.count({ where: { ownerId: id } })).toBe(6);
  });

  it("deux renaissances simultanées : une seule passe, un seul booster offert", async () => {
    const id = await collector(0);
    const run = () => rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 40, sacrificedEngraved: [] }, ctx());
    const codes = await Promise.all([code(run()), code(run())]);
    expect(codes.filter((c) => c === null)).toHaveLength(1);
    expect(codes.filter((c) => c === "STALE")).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id }, select: { prestige: true } })).prestige).toBe(1);
    expect(await credits(id)).toBe(1);
  });

  it("booster offert introuvable, scellé ou coupé : la renaissance passe sans rien créditer", async () => {
    const base = { expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 40, sacrificedEngraved: [] };
    for (const booster of [
      { slug: `inconnu-${tag}`, count: 1 },
      { slug: sealedSlug, count: 1 },
      { slug: boosterSlug, count: 0 },
    ]) {
      const id = await collector(0);
      const out = await rebirthWith(prisma, { ...base, userId: id }, ctx(booster));
      expect(out.prestige).toBe(1);
      expect(out.boosters).toBeNull();
      expect(await prisma.boosterCredit.count({ where: { userId: id } })).toBe(0);
    }
  });

  it("un récapitulatif périmé ne crédite aucun booster", async () => {
    const id = await collector(1);
    expect(await code(rebirthWith(prisma, { userId: id, expectedPrestige: 0, keep: { copyIds: [], cardIds: [] }, expectedZeni: 41, sacrificedEngraved: [] }, ctx()))).toBe("STALE");
    expect(await credits(id)).toBe(0);
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
    // Une gravée renvoie au compteur de son tirage (clé étrangère)
    await prisma.cardPrinting.upsert({ where: { cardId_printing: { cardId: cards[3], printing: 1 } }, create: { cardId: cards[3], printing: 1, size: 999 }, update: {} });
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
  it("consécration : une héritière au plafond part au sanctuaire, une seule fois, même à deux clics simultanés", async () => {
    const id = await player();
    await prisma.user.update({ where: { id }, data: { prestige: 5, prestigedAt: new Date() } });
    const relic = await prisma.userCard.create({ data: { ownerId: id, cardId: cards[0], heritage: 5, keptByOwner: 1 }, select: { id: true } });
    const run = () => consecrateWith(prisma, { userId: id, userCardId: relic.id, now: new Date() }, { heritageMax: 5, consecrateMinOwnCycles: 1 }).then(
      () => null,
      (e: unknown) => (e instanceof ConsecrateError ? e.code : Promise.reject(e)),
    );
    const codes = await Promise.all([run(), run()]);
    expect(codes.filter((c) => c === null)).toHaveLength(1);
    expect(codes.filter((c) => c === "NOT_ELIGIBLE")).toHaveLength(1);
    expect(await prisma.userCard.count({ where: { id: relic.id } })).toBe(0);
    expect(await prisma.consecratedCard.count({ where: { id: relic.id, userId: id } })).toBe(1);
  });
});
