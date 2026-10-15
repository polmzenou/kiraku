import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { seededRng } from "@/lib/boosters/rng";
import { minNextBid, saleFee, type MarketRules } from "@/lib/market/rules";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import {
  adminCancelAuctionWith,
  AuctionError,
  buyNowWith,
  cancelAuctionWith,
  createAuctionWith,
  placeBidWith,
  settleAuctionWith,
  settleDueWith,
} from "./auction-core";

// Hôtel des ventes sous concurrence, sur une vraie base (branche Neon de dev) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/market/market.db.test.ts
//
// Invariant vérifié partout : Σ soldes + Σ séquestre (currentBid des ventes ACTIVE) + Σ taxes = Σ dépôts.
// Pendant les enchères, la somme des soldes plus le séquestre ne bouge pas ; à la clôture, seule
// la taxe sort du jeu. Et pour chaque joueur, solde = Σ journal.

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
};

function codeOf(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "OK";
  return r.reason instanceof AuctionError ? r.reason.code : `UNEXPECTED: ${String(r.reason)}`;
}

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = seededRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe.skipIf(!url)("hôtel des ventes atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  const users: string[] = [];
  let cardId: string;

  /** Joueur inscrit depuis 72 h, avec son solde de départ justifié par le journal. */
  async function player(role: "USER" | "ADMIN" = "USER") {
    const user = await prisma.user.create({
      data: {
        username: `test-${randomBytes(4).toString("hex")}`,
        isGuest: false,
        coins: START,
        role,
        createdAt: new Date(Date.now() - 72 * HOUR),
      },
      select: { id: true },
    });
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: START, reason: "SIGNUP", balanceAfter: START } });
    users.push(user.id);
    return user.id;
  }

  async function players(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(await player());
    return ids;
  }

  /** Vendeur avec un exemplaire de la carte de test, mis en vente. */
  async function listing(opts: { startPrice?: number; buyoutPrice?: number | null } = {}) {
    const sellerId = await player();
    await prisma.userCard.create({ data: { ownerId: sellerId, cardId } });
    const { auctionId } = await createAuctionWith(prisma, {
      sellerId,
      cardId,
      startPrice: opts.startPrice ?? 100,
      buyoutPrice: opts.buyoutPrice ?? null,
      durationHours: 24,
      now: new Date(),
      rules,
    });
    return { sellerId, auctionId };
  }

  async function coinsOf(ids: readonly string[]) {
    const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, coins: true } });
    return new Map(rows.map((r) => [r.id, r.coins]));
  }

  async function sumCoins(ids: readonly string[]) {
    return [...(await coinsOf(ids)).values()].reduce((s, c) => s + c, 0);
  }

  async function balanceMatchesLedger(userId: string) {
    const [user, agg, last] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
      prisma.coinTransaction.findFirst({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { balanceAfter: true },
      }),
    ]);
    return user.coins === (agg._sum.amount ?? 0) && user.coins >= 0 && (last?.balanceAfter ?? user.coins) === user.coins;
  }

  async function auction(id: string) {
    return prisma.auction.findUniqueOrThrow({ where: { id }, include: { userCard: true } });
  }

  beforeAll(async () => {
    const card = await prisma.card.findFirst({ where: { rank: { not: null } }, orderBy: { rank: "asc" }, select: { id: true } });
    if (!card) throw new Error("Catalogue vide : lance d'abord l'import");
    cardId = card.id;
  }, 60_000);

  afterAll(async () => {
    const mine = { userId: { in: users } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { OR: [mine, { actorId: { in: users } }] } }),
      prisma.adminLog.deleteMany({ where: { adminId: { in: users } } }),
      prisma.bid.deleteMany({ where: { OR: [{ bidderId: { in: users } }, { auction: { sellerId: { in: users } } }] } }),
      prisma.auction.deleteMany({ where: { sellerId: { in: users } } }),
      prisma.discovery.deleteMany({ where: mine }),
      prisma.showcaseSlot.deleteMany({ where: mine }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where: mine }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  describe("50 enchères simultanées sur une vente", () => {
    let sellerId: string;
    let auctionId: string;
    let bidders: string[];
    let all: string[];
    const TOTAL = 51 * START;

    beforeAll(async () => {
      ({ sellerId, auctionId } = await listing({ startPrice: 100 }));
      bidders = await players(50);
      all = [sellerId, ...bidders];
    }, 120_000);

    it("la somme des soldes plus le séquestre ne bouge pas", async () => {
      // Montants distincts de 100 à 982, envoyés dans un ordre mélangé
      const offers = shuffle(
        bidders.map((id, i) => ({ id, amount: 100 + 18 * i })),
        42,
      );
      const results = await Promise.allSettled(
        offers.map((o) => placeBidWith(prisma, { bidderId: o.id, auctionId, amount: o.amount, now: new Date(), rules })),
      );

      // 1. Seuls des refus métier « mise trop basse » : aucun interblocage, aucune autre erreur
      const codes = results.map(codeOf);
      expect(codes.filter((c) => c !== "OK" && c !== "TOO_LOW")).toEqual([]);
      const accepted = codes.filter((c) => c === "OK").length;
      expect(accepted).toBeGreaterThan(0);

      const a = await auction(auctionId);
      expect(a.status).toBe("ACTIVE");
      expect(a.currentBid).not.toBeNull();

      // 2. Σ soldes + séquestre = total de départ
      expect((await sumCoins(all)) + a.currentBid!).toBe(TOTAL);

      // 3. Seul le meneur a des Zeni bloqués ; le vendeur n'a pas bougé
      const coins = await coinsOf(all);
      expect(coins.get(a.currentBidderId!)).toBe(START - a.currentBid!);
      for (const id of all) if (id !== a.currentBidderId) expect(coins.get(id)).toBe(START);

      // 4. Journal des mises cohérent avec la vente, chaque mise au-dessus du minimum de la précédente
      const bids = await prisma.bid.findMany({ where: { auctionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      expect(bids).toHaveLength(accepted);
      expect(a.bidCount).toBe(accepted);
      expect(bids.at(-1)!.amount).toBe(a.currentBid);
      expect(bids.at(-1)!.bidderId).toBe(a.currentBidderId);
      expect(a.price).toBe(a.currentBid);
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i].amount).toBeGreaterThanOrEqual(minNextBid(bids[i - 1].amount, 100, rules.minIncrementBp));
      }

      // 5. Une ligne BID_HOLD par mise, une BID_REFUND par mise dépassée
      const [holds, refunds] = await Promise.all([
        prisma.coinTransaction.count({ where: { refId: auctionId, reason: "BID_HOLD" } }),
        prisma.coinTransaction.count({ where: { refId: auctionId, reason: "BID_REFUND" } }),
      ]);
      expect(holds).toBe(accepted);
      expect(refunds).toBe(accepted - 1);

      // 6. Solde = journal pour les 51 joueurs
      for (const id of all) expect(await balanceMatchesLedger(id)).toBe(true);

      // 7. La carte est toujours réservée chez le vendeur
      expect(a.userCard).toMatchObject({ ownerId: sellerId, status: "AUCTION" });
    }, 180_000);

    it("12 clôtures simultanées n'en appliquent qu'une, et seule la taxe sort du jeu", async () => {
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });
      const before = await auction(auctionId);
      const now = new Date();

      const runs = await Promise.allSettled([
        ...Array.from({ length: 10 }, () => settleAuctionWith(prisma, auctionId, now)),
        settleDueWith(prisma, now),
        settleDueWith(prisma, now),
      ]);
      expect(runs.map(codeOf).filter((c) => c !== "OK")).toEqual([]);
      const single = runs.slice(0, 10).map((r) => (r as PromiseFulfilledResult<{ settled: boolean }>).value.settled);
      const swept = runs.slice(10).map((r) => (r as PromiseFulfilledResult<{ settled: number }>).value.settled);
      expect(single.filter(Boolean).length + swept.reduce((s, n) => s + n, 0)).toBe(1);

      const a = await auction(auctionId);
      const fee = saleFee(before.currentBid!, before.feeBp);
      expect(a).toMatchObject({ status: "SOLD", finalPrice: before.currentBid, fee });
      expect(a.userCard).toMatchObject({ ownerId: before.currentBidderId, status: "COLLECTION" });
      expect((await coinsOf([sellerId])).get(sellerId)).toBe(START + before.currentBid! - fee);
      const [sale, tax] = await Promise.all([
        prisma.coinTransaction.findMany({ where: { refId: auctionId, reason: "SALE" }, select: { amount: true } }),
        prisma.coinTransaction.findMany({ where: { refId: auctionId, reason: "FEE" }, select: { amount: true } }),
      ]);
      expect(sale).toEqual([{ amount: before.currentBid }]);
      expect(tax).toEqual(fee > 0 ? [{ amount: -fee }] : []);
      expect((await sumCoins(all)) + fee).toBe(TOTAL);
      for (const id of all) expect(await balanceMatchesLedger(id)).toBe(true);

      // Rejouer la clôture ne change plus rien
      expect(await settleAuctionWith(prisma, auctionId, new Date())).toEqual({ settled: false });
      expect((await sumCoins(all)) + fee).toBe(TOTAL);
    }, 120_000);
  });

  it("un enchérisseur, 50 ventes, 1 000 Zeni : 10 mises de 100 tiennent, jamais plus", async () => {
    const auctions: { sellerId: string; auctionId: string }[] = [];
    for (let i = 0; i < 50; i++) auctions.push(await listing({ startPrice: 100 }));
    const bidder = await player();
    const results = await Promise.allSettled(
      auctions.map((a) => placeBidWith(prisma, { bidderId: bidder, auctionId: a.auctionId, amount: 100, now: new Date(), rules })),
    );
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c !== "OK" && c !== "NOT_ENOUGH_ZENI")).toEqual([]);
    expect(codes.filter((c) => c === "OK")).toHaveLength(10);
    expect((await coinsOf([bidder])).get(bidder)).toBe(0);
    const held = await prisma.auction.aggregate({
      where: { id: { in: auctions.map((a) => a.auctionId) }, currentBidderId: bidder },
      _sum: { currentBid: true },
      _count: true,
    });
    expect(held._count).toBe(10);
    expect(held._sum.currentBid).toBe(START);
    expect(await balanceMatchesLedger(bidder)).toBe(true);
  }, 300_000);

  it("mises croisées (P sur la vente de Q, Q sur celle de P) : aucun interblocage", async () => {
    const x = await listing({ startPrice: 100 });
    const y = await listing({ startPrice: 100 });
    const [p, q] = await players(2);
    await placeBidWith(prisma, { bidderId: p, auctionId: x.auctionId, amount: 100, now: new Date(), rules });
    await placeBidWith(prisma, { bidderId: q, auctionId: y.auctionId, amount: 100, now: new Date(), rules });
    const everyone = [x.sellerId, y.sellerId, p, q];

    for (let round = 0; round < 20; round++) {
      const [ax, ay] = await Promise.all([auction(x.auctionId), auction(y.auctionId)]);
      // Chacun mise sur la vente que l'autre mène
      const pTarget = ax.currentBidderId === q ? ax : ay;
      const qTarget = pTarget === ax ? ay : ax;
      const results = await Promise.allSettled([
        placeBidWith(prisma, {
          bidderId: p,
          auctionId: pTarget.id,
          amount: minNextBid(pTarget.currentBid, 100, rules.minIncrementBp),
          now: new Date(),
          rules,
        }),
        placeBidWith(prisma, {
          bidderId: q,
          auctionId: qTarget.id,
          amount: minNextBid(qTarget.currentBid, 100, rules.minIncrementBp),
          now: new Date(),
          rules,
        }),
      ]);
      expect(results.map(codeOf)).toEqual(["OK", "OK"]);
      const [nx, ny] = await Promise.all([auction(x.auctionId), auction(y.auctionId)]);
      expect((await sumCoins(everyone)) + nx.currentBid! + ny.currentBid!).toBe(4 * START);
    }
    for (const id of everyone) expect(await balanceMatchesLedger(id)).toBe(true);
  }, 300_000);

  it("annulation du vendeur contre 20 mises : l'une ou les autres, jamais un mélange", async () => {
    const { sellerId, auctionId } = await listing({ startPrice: 100 });
    const bidders = await players(20);
    const results = await Promise.allSettled([
      cancelAuctionWith(prisma, { sellerId, auctionId, now: new Date() }),
      ...bidders.map((id, i) => placeBidWith(prisma, { bidderId: id, auctionId, amount: 100 + 10 * i, now: new Date(), rules })),
    ]);
    const [cancel, ...bids] = results.map(codeOf);
    expect(bids.filter((c) => !["OK", "TOO_LOW", "CLOSED"].includes(c))).toEqual([]);

    const a = await auction(auctionId);
    if (cancel === "OK") {
      expect(a.status).toBe("CANCELLED");
      expect(a.bidCount).toBe(0);
      expect(bids.filter((c) => c === "OK")).toEqual([]);
      expect(a.userCard).toMatchObject({ ownerId: sellerId, status: "COLLECTION" });
      expect(await sumCoins([sellerId, ...bidders])).toBe(21 * START);
    } else {
      expect(cancel).toBe("HAS_BIDS");
      expect(a.status).toBe("ACTIVE");
      expect(a.bidCount).toBeGreaterThan(0);
      expect(a.userCard).toMatchObject({ ownerId: sellerId, status: "AUCTION" });
      expect((await sumCoins([sellerId, ...bidders])) + a.currentBid!).toBe(21 * START);
    }
    for (const id of [sellerId, ...bidders]) expect(await balanceMatchesLedger(id)).toBe(true);
  }, 180_000);

  it("20 mises en vente simultanées du seul exemplaire : une seule vente", async () => {
    const sellerId = await player();
    const copy = await prisma.userCard.create({ data: { ownerId: sellerId, cardId } });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        createAuctionWith(prisma, { sellerId, cardId, startPrice: 50, buyoutPrice: null, durationHours: 1, now: new Date(), rules }),
      ),
    );
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "OK")).toHaveLength(1);
    expect(codes.filter((c) => c !== "OK" && c !== "NOT_OWNED")).toEqual([]);
    expect(await prisma.auction.count({ where: { sellerId, status: "ACTIVE" } })).toBe(1);
    expect(await prisma.userCard.findUniqueOrThrow({ where: { id: copy.id } })).toMatchObject({ status: "AUCTION" });
  }, 120_000);

  it("achat immédiat contre mises : un seul acheteur, les autres remboursés", async () => {
    const { sellerId, auctionId } = await listing({ startPrice: 100, buyoutPrice: 500 });
    const crowd = await players(20);
    const results = await Promise.allSettled(
      crowd.map((id, i) =>
        i % 2 === 0
          ? buyNowWith(prisma, { buyerId: id, auctionId, expectedPrice: 500, now: new Date(), rules })
          : placeBidWith(prisma, { bidderId: id, auctionId, amount: 100 + 20 * i, now: new Date(), rules }), // 100 à 480 : sous l'achat immédiat
      ),
    );
    const codes = results.map(codeOf);
    expect(codes.filter((c) => !["OK", "TOO_LOW", "CLOSED", "NO_BUYOUT"].includes(c))).toEqual([]);
    const buyers = crowd.filter((_, i) => i % 2 === 0 && codes[i] === "OK");
    expect(buyers).toHaveLength(1);

    const a = await auction(auctionId);
    const fee = saleFee(500, a.feeBp);
    expect(a).toMatchObject({ status: "SOLD", finalPrice: 500, fee, currentBidderId: buyers[0] });
    expect(a.userCard).toMatchObject({ ownerId: buyers[0], status: "COLLECTION" });
    const coins = await coinsOf([sellerId, ...crowd]);
    expect(coins.get(buyers[0])).toBe(START - 500);
    expect(coins.get(sellerId)).toBe(START + 500 - fee);
    for (const id of crowd) if (id !== buyers[0]) expect(coins.get(id)).toBe(START);
    expect((await sumCoins([sellerId, ...crowd])) + fee).toBe(21 * START);
    for (const id of [sellerId, ...crowd]) expect(await balanceMatchesLedger(id)).toBe(true);
  }, 180_000);

  it("anti-sniping : une mise à 60 s de la fin repousse la fin à 2 min", async () => {
    const { auctionId } = await listing({ startPrice: 100 });
    const [bidder] = await players(1);
    const now = new Date();
    await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(now.getTime() + 60_000) } });
    const res = await placeBidWith(prisma, { bidderId: bidder, auctionId, amount: 100, now, rules });
    expect(res.endsAt).toEqual(new Date(now.getTime() + rules.extendSeconds * 1000));
    expect((await auction(auctionId)).endsAt).toEqual(res.endsAt);
  }, 60_000);

  it("une vente sans mise expire et rend la carte", async () => {
    const { sellerId, auctionId } = await listing({ startPrice: 100 });
    await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    expect(await settleAuctionWith(prisma, auctionId, new Date())).toMatchObject({ settled: true, status: "EXPIRED" });
    const a = await auction(auctionId);
    expect(a.status).toBe("EXPIRED");
    expect(a.userCard).toMatchObject({ ownerId: sellerId, status: "COLLECTION" });
    expect((await coinsOf([sellerId])).get(sellerId)).toBe(START);
  }, 60_000);

  it("annulation par l'admin : la mise est rendue, la carte revient au vendeur", async () => {
    const { sellerId, auctionId } = await listing({ startPrice: 100 });
    const [bidder] = await players(1);
    const admin = await player("ADMIN");
    await placeBidWith(prisma, { bidderId: bidder, auctionId, amount: 300, now: new Date(), rules });
    await adminCancelAuctionWith(prisma, { adminId: admin, auctionId, now: new Date() });
    await expect(adminCancelAuctionWith(prisma, { adminId: admin, auctionId, now: new Date() })).rejects.toMatchObject({
      code: "CLOSED",
    });
    const a = await auction(auctionId);
    expect(a).toMatchObject({ status: "CANCELLED", cancelledById: admin });
    expect(a.userCard).toMatchObject({ ownerId: sellerId, status: "COLLECTION" });
    expect((await coinsOf([bidder])).get(bidder)).toBe(START);
    expect(await balanceMatchesLedger(bidder)).toBe(true);
    expect(await prisma.adminLog.count({ where: { adminId: admin, targetId: auctionId } })).toBe(1);
  }, 60_000);

  it("bilan : Σ soldes + Σ séquestre + Σ taxes = Σ dépôts, et Σ soldes = Σ journal", async () => {
    const [coins, ledger, escrow, fees] = await Promise.all([
      prisma.user.aggregate({ where: { id: { in: users } }, _sum: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId: { in: users } }, _sum: { amount: true } }),
      prisma.auction.aggregate({ where: { sellerId: { in: users }, status: "ACTIVE" }, _sum: { currentBid: true } }),
      prisma.auction.aggregate({ where: { sellerId: { in: users }, status: "SOLD" }, _sum: { fee: true } }),
    ]);
    expect(coins._sum.coins).toBe(ledger._sum.amount);
    expect((coins._sum.coins ?? 0) + (escrow._sum.currentBid ?? 0) + (fees._sum.fee ?? 0)).toBe(users.length * START);
  }, 60_000);
});
