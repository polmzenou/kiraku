import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { saleFee, type MarketRules } from "@/lib/market/rules";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import { alertOwnersWith, BuyOrderError, cancelOrderWith, createOrderWith, expireDueWith, fillOrderWith } from "./buy-order-core";

// Avis de recherche sous concurrence, sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/market/buy-orders.db.test.ts
//
// Invariant vérifié : Σ soldes + Σ séquestre (prix des avis OPEN) + Σ taxes = Σ dépôts, et pour chaque
// joueur, solde = Σ journal. Une carte ne change de main qu'une fois, un avis n'est rempli qu'une fois.

const url = process.env.DATABASE_URL_TEST;
const START = 1_000;
const HOUR = 3_600_000;

const rules: MarketRules = {
  enabled: true,
  feeBp: SETTING_DEFAULTS["market.feeBp"],
  minIncrementBp: SETTING_DEFAULTS["market.minIncrementBp"],
  antiSnipeSeconds: SETTING_DEFAULTS["market.antiSnipeSeconds"],
  extendSeconds: SETTING_DEFAULTS["market.extendSeconds"],
  durationsHours: SETTING_DEFAULTS["market.durationsHours"],
  maxActivePerSeller: SETTING_DEFAULTS["market.maxActivePerSeller"],
  minAccountAgeHours: SETTING_DEFAULTS["market.minAccountAgeHours"],
  minStartPrice: SETTING_DEFAULTS["market.minStartPrice"],
  maxPrice: SETTING_DEFAULTS["market.maxPrice"],
  maxPriceByRarity: {},
};
const DURATION = 7;
const MAX_OPEN = 10;

function codeOf(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "OK";
  return r.reason instanceof BuyOrderError ? r.reason.code : `UNEXPECTED: ${String(r.reason)}`;
}

describe.skipIf(!url)("avis de recherche atomiques (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const users: string[] = [];
  const tag = randomBytes(4).toString("hex");
  let seriesId: string;
  let cardId: string;
  /** Cartes jetables propres à un test (ses détenteurs ne sont pas ceux des autres tests). */
  const extraCards: string[] = [];

  async function player(coins = START) {
    const user = await prisma.user.create({
      // L'âge anti-multicomptes se compte depuis l'inscription (sans elle, le trigger la poserait à maintenant)
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins, createdAt: new Date(Date.now() - 72 * HOUR), registeredAt: new Date(Date.now() - 72 * HOUR) },
      select: { id: true },
    });
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: coins, reason: "SIGNUP", balanceAfter: coins } });
    users.push(user.id);
    return user.id;
  }

  /** Détenteur d'un (ou plusieurs) exemplaires de la carte de test. */
  async function holder(copies = 1) {
    const id = await player();
    for (let i = 0; i < copies; i++) await prisma.userCard.create({ data: { ownerId: id, cardId } });
    return id;
  }

  async function order(buyerId: string, price = 100) {
    return createOrderWith(prisma, { buyerId, cardId, price, now: new Date(), rules, durationDays: DURATION, maxOpen: MAX_OPEN });
  }

  async function balanceMatchesLedger(userId: string) {
    const [user, agg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    return user.coins === (agg._sum.amount ?? 0) && user.coins >= 0;
  }

  /** Σ soldes + séquestre des avis ouverts + taxes prélevées, sur les joueurs du test. */
  async function ledgerTotal() {
    const [coins, escrow, fees] = await Promise.all([
      prisma.user.aggregate({ where: { id: { in: users } }, _sum: { coins: true } }),
      prisma.buyOrder.aggregate({ where: { buyerId: { in: users }, status: "OPEN" }, _sum: { price: true } }),
      prisma.coinTransaction.aggregate({ where: { userId: { in: users }, reason: "FEE" }, _sum: { amount: true } }),
    ]);
    return (coins._sum.coins ?? 0) + (escrow._sum.price ?? 0) - (fees._sum.amount ?? 0);
  }

  beforeAll(async () => {
    // Série et carte jetables : le test ne dépend pas du catalogue importé
    const series = await prisma.series.create({ data: { type: "ANIME", titleRomaji: `Test ${tag}`, genres: [], tags: [] }, select: { id: true } });
    seriesId = series.id;
    const card = await prisma.card.create({
      data: { name: `Carte ${tag}`, imageUrl: "x", favorites: 1, rarity: "EPIC", power: 1, ki: 1, seriesId, searchText: tag, status: "PUBLISHED" },
      select: { id: true },
    });
    cardId = card.id;
  }, 60_000);

  afterAll(async () => {
    const mine = { userId: { in: users } };
    const testCards = { in: [cardId, ...extraCards] };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { OR: [mine, { actorId: { in: users } }] } }),
      prisma.buyOrder.deleteMany({ where: { cardId: testCards } }),
      prisma.discovery.deleteMany({ where: mine }),
      prisma.wishlistEntry.deleteMany({ where: mine }),
      prisma.userCard.deleteMany({ where: { cardId: testCards } }),
      prisma.coinTransaction.deleteMany({ where: mine }),
      prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: users } }, { blockedId: { in: users } }] } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: testCards } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("bloque le prix à la publication, refuse au-delà du solde et de la limite d'avis ouverts", async () => {
    const buyer = await player(450);
    // 12 publications simultanées à 100 : 4 passent (solde), jamais plus
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => order(buyer, 100)));
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "OK")).toHaveLength(4);
    expect(new Set(codes.filter((c) => c !== "OK"))).toEqual(new Set(["NOT_ENOUGH_ZENI"]));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer } })).coins).toBe(50);
    expect(await balanceMatchesLedger(buyer)).toBe(true);

    const rich = await player(1_000_000);
    const many = await Promise.allSettled(Array.from({ length: MAX_OPEN + 5 }, () => order(rich, 100)));
    expect(many.map(codeOf).filter((c) => c === "OK")).toHaveLength(MAX_OPEN);
    expect(many.map(codeOf).filter((c) => c === "TOO_MANY_OPEN")).toHaveLength(5);
  });

  it("20 détenteurs vendent au même avis : un seul passe, la carte change de main une fois", async () => {
    const buyer = await player();
    const { orderId } = await order(buyer, 200);
    const sellers: string[] = [];
    for (let i = 0; i < 20; i++) sellers.push(await holder());
    const before = await ledgerTotal();

    const results = await Promise.allSettled(sellers.map((sellerId) => fillOrderWith(prisma, { sellerId, orderId, expectedPrice: 200, now: new Date(), rules })));
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "OK")).toHaveLength(1);
    expect(new Set(codes.filter((c) => c !== "OK"))).toEqual(new Set(["CLOSED"]));

    const filled = await prisma.buyOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(filled.status).toBe("FILLED");
    expect(filled.fee).toBe(saleFee(200, rules.feeBp));
    expect(await prisma.userCard.count({ where: { ownerId: buyer, cardId } })).toBe(1);
    expect(await prisma.userCard.count({ where: { ownerId: filled.sellerId!, cardId } })).toBe(0);
    // Le séquestre devient le paiement du vendeur ; seule la taxe sort
    expect(await ledgerTotal()).toBe(before);
    for (const id of [buyer, ...sellers]) expect(await balanceMatchesLedger(id)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: filled.sellerId! } })).coins).toBe(START + 200 - filled.fee!);
  });

  it("un seul exemplaire face à deux avis en parallèle : un seul est rempli", async () => {
    const [a, b] = [await player(), await player()];
    const [oa, ob] = [await order(a, 150), await order(b, 160)];
    const seller = await holder(1);
    const results = await Promise.allSettled([
      fillOrderWith(prisma, { sellerId: seller, orderId: oa.orderId, expectedPrice: 150, now: new Date(), rules }),
      fillOrderWith(prisma, { sellerId: seller, orderId: ob.orderId, expectedPrice: 160, now: new Date(), rules }),
    ]);
    expect(results.map(codeOf).sort()).toEqual(["NOT_OWNED", "OK"]);
    const statuses = (await prisma.buyOrder.findMany({ where: { id: { in: [oa.orderId, ob.orderId] } } })).map((o) => o.status).sort();
    expect(statuses).toEqual(["FILLED", "OPEN"]);
    expect(await balanceMatchesLedger(seller)).toBe(true);
  });

  it("annulation contre 10 ventes : l'une ou les autres, jamais un mélange", async () => {
    const buyer = await player();
    const { orderId } = await order(buyer, 120);
    const sellers: string[] = [];
    for (let i = 0; i < 10; i++) sellers.push(await holder());
    const before = await ledgerTotal();
    const [cancel, ...fills] = await Promise.allSettled([
      cancelOrderWith(prisma, { buyerId: buyer, orderId, now: new Date() }),
      ...sellers.map((sellerId) => fillOrderWith(prisma, { sellerId, orderId, expectedPrice: 120, now: new Date(), rules })),
    ]);
    const final = await prisma.buyOrder.findUniqueOrThrow({ where: { id: orderId } });
    const sold = fills.map(codeOf).filter((c) => c === "OK").length;
    if (final.status === "CANCELLED") {
      expect(sold).toBe(0);
      expect(cancel.status === "fulfilled" && cancel.value.cancelled).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer } })).coins).toBe(START);
    } else {
      expect(final.status).toBe("FILLED");
      expect(sold).toBe(1);
      expect(cancel.status === "fulfilled" && cancel.value.cancelled).toBe(false);
    }
    expect(await ledgerTotal()).toBe(before);
    expect(await balanceMatchesLedger(buyer)).toBe(true);
  });

  it("refuse un prix changé, son propre avis et l'avis d'un autre à annuler", async () => {
    const buyer = await holder(1);
    const { orderId } = await order(buyer, 90);
    const seller = await holder(1);
    await expect(fillOrderWith(prisma, { sellerId: seller, orderId, expectedPrice: 91, now: new Date(), rules })).rejects.toMatchObject({ code: "STALE" });
    await expect(fillOrderWith(prisma, { sellerId: buyer, orderId, expectedPrice: 90, now: new Date(), rules })).rejects.toMatchObject({ code: "OWN_ORDER" });
    await expect(cancelOrderWith(prisma, { buyerId: seller, orderId, now: new Date() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.buyOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("OPEN");
  });

  it("un avis échu n'est plus vendable et ses Zeni reviennent une seule fois, même en balayages simultanés", async () => {
    const buyer = await player();
    const { orderId } = await order(buyer, 300);
    await prisma.buyOrder.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const seller = await holder(1);
    await expect(fillOrderWith(prisma, { sellerId: seller, orderId, expectedPrice: 300, now: new Date(), rules })).rejects.toMatchObject({ code: "CLOSED" });

    const sweeps = await Promise.all(Array.from({ length: 5 }, () => expireDueWith(prisma, new Date(), 100, undefined, buyer)));
    expect(sweeps.reduce((s, r) => s + r.expired, 0)).toBe(1);
    expect((await prisma.buyOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("EXPIRED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer } })).coins).toBe(START);
    expect(await prisma.notification.count({ where: { userId: buyer, type: "BUY_ORDER_EXPIRED" } })).toBe(1);
    expect(await balanceMatchesLedger(buyer)).toBe(true);
  });

  it("prévient les détenteurs au-dessus de la cote, une fois par jour et par carte", async () => {
    const buyer = await player();
    const owner = await holder(1);
    const first = await order(buyer, 500);
    const payload = { orderId: first.orderId, buyerId: buyer, cardId, price: 500 };
    expect(await alertOwnersWith(prisma, payload, 600, new Date())).toBe(0); // sous la cote : rien
    expect(await alertOwnersWith(prisma, payload, 400, new Date())).toBeGreaterThanOrEqual(1);
    expect(await alertOwnersWith(prisma, payload, null, new Date())).toBe(0); // déjà prévenu aujourd'hui
    expect(await prisma.notification.count({ where: { userId: owner, type: "BUY_ORDER_WANTED", refId: cardId } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer, type: "BUY_ORDER_WANTED" } })).toBe(0);
  });

  it("alertes : blocages écartés, plafond par acheteur, avis annulé relu avant d'alerter", async () => {
    // Carte propre au test : seuls ses détenteurs comptent
    const own = await prisma.card.create({
      data: { name: `Carte ${tag} b`, imageUrl: "x", favorites: 1, rarity: "EPIC", power: 1, ki: 1, seriesId, searchText: `${tag}b`, status: "PUBLISHED" },
      select: { id: true },
    });
    extraCards.push(own.id);
    const ownerOf = async () => {
      const id = await player();
      await prisma.userCard.create({ data: { ownerId: id, cardId: own.id } });
      return id;
    };
    const buyer = await player();
    const [h1, h2, h3, blocker, blocked] = [await ownerOf(), await ownerOf(), await ownerOf(), await ownerOf(), await ownerOf()];
    await prisma.userBlock.create({ data: { blockerId: blocker, blockedId: buyer } });
    await prisma.userBlock.create({ data: { blockerId: buyer, blockedId: blocked } });
    const placed = await createOrderWith(prisma, { buyerId: buyer, cardId: own.id, price: 100, now: new Date(), rules, durationDays: DURATION, maxOpen: MAX_OPEN });
    const payload = { orderId: placed.orderId, buyerId: buyer, cardId: own.id, price: 100 };

    // Plafond de 2 alertes par acheteur sur 24 h, jamais ceux des blocages
    expect(await alertOwnersWith(prisma, payload, null, new Date(), undefined, { perDay: 2 })).toBe(2);
    expect(await alertOwnersWith(prisma, payload, null, new Date(), undefined, { perDay: 2 })).toBe(0);
    // Sans plafond : le troisième détenteur seulement (les deux autres ont déjà été prévenus aujourd'hui)
    expect(await alertOwnersWith(prisma, payload, null, new Date())).toBe(1);
    const alerted = await prisma.notification.findMany({ where: { type: "BUY_ORDER_WANTED", refId: own.id }, select: { userId: true } });
    expect(new Set(alerted.map((n) => n.userId))).toEqual(new Set([h1, h2, h3]));
    // Carte sans cote, référence de rareté demandée mais absente : personne
    expect(await alertOwnersWith(prisma, payload, null, new Date(), undefined, { rarity: { reference: null } })).toBe(0);

    // Avis annulé avant l'alerte (elle part après la réponse) : personne n'est prévenu
    const late = await ownerOf();
    const other = await player();
    const cancelled = await createOrderWith(prisma, { buyerId: other, cardId: own.id, price: 100, now: new Date(), rules, durationDays: DURATION, maxOpen: MAX_OPEN });
    await cancelOrderWith(prisma, { buyerId: other, orderId: cancelled.orderId, now: new Date() });
    expect(await alertOwnersWith(prisma, { orderId: cancelled.orderId, buyerId: other, cardId: own.id, price: 100 }, null, new Date())).toBe(0);
    expect(await prisma.notification.count({ where: { userId: late, type: "BUY_ORDER_WANTED" } })).toBe(0);
  });
});
