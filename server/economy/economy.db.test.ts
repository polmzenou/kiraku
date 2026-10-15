import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { groupByRarity, type CardPool } from "@/lib/boosters/draw";
import { seededRng } from "@/lib/boosters/rng";
import type { Rarity } from "@/lib/catalog/rarity";
import { selectMissionRotation } from "@/lib/economy/mission-rotation";
import type { ReferralRules } from "@/lib/economy/referral";
import { debit, LedgerError } from "./ledger";
import type { LotDeps } from "./lots";
import { claimMissionWith, MissionError } from "./missions-core";
import { attachReferralWith, claimReferralWith, ReferralError } from "./referral-core";
import { buyWithZeniWith, ShopError } from "./shop-core";

// Concurrence de l'économie sur une vraie base (branche Neon de dev) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/economy/economy.db.test.ts
// Crée des joueurs, un lot, une mission et un article jetables, puis supprime ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;
const START = 1_000;
const TZ = "Europe/Paris";

describe.skipIf(!url)("économie atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  const tag = randomBytes(4).toString("hex");
  const users: string[] = [];
  let lotId: string;
  let missionId: string;
  let missionNow: Date;
  let shopItemId: string;
  let standardId: string;
  let pool: CardPool;
  const deps: LotDeps = { rng: seededRng(42), loadPool: async () => pool };
  const rules: ReferralRules = {
    enabled: true,
    attachWindowDays: 7,
    maxPerMonth: 10,
    minAccountAgeHours: 48,
    minBoostersOpened: 20,
    requireVerified: true,
  };

  async function player() {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins: START },
      select: { id: true, referralCode: true },
    });
    // Solde de départ justifié par le journal, comme pour un vrai joueur
    await prisma.coinTransaction.create({ data: { userId: user.id, amount: START, reason: "SIGNUP", balanceAfter: START } });
    users.push(user.id);
    return user;
  }

  async function balanceMatchesLedger(userId: string) {
    const [user, agg, last] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
      prisma.coinTransaction.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { balanceAfter: true } }),
    ]);
    return user.coins === (agg._sum.amount ?? 0) && user.coins >= 0 && (last?.balanceAfter ?? user.coins) === user.coins;
  }

  beforeAll(async () => {
    const [standard, cards] = await Promise.all([
      prisma.boosterType.findUnique({ where: { slug: "standard" }, select: { id: true } }),
      prisma.card.findMany({ where: { rank: { not: null } }, orderBy: { rank: "asc" }, take: 500, select: { id: true, rarity: true } }),
    ]);
    if (!standard || cards.length === 0) throw new Error("Catalogue ou booster standard absents : lance d'abord les imports et le seed");
    standardId = standard.id;
    pool = groupByRarity(cards.map((c) => ({ id: c.id, rarity: c.rarity as Rarity })));

    const lot = await prisma.lot.create({
      data: {
        name: { fr: `test-${tag}`, en: "" },
        zeni: 100,
        items: {
          create: [
            { kind: "BOOSTER", boosterTypeId: standardId, quantity: 1 },
            { kind: "RARITY_CARD", rarity: "RARE", quantity: 1 },
          ],
        },
      },
    });
    lotId = lot.id;
    missionId = (await prisma.mission.create({ data: { key: `test-${tag}`, period: "DAILY", metric: "VISIT", goal: 1, lotId } })).id;
    const candidates = await prisma.mission.findMany({ where: { active: true } });
    // La mission jetable doit appartenir à la rotation testée, sans changer les autres missions.
    for (let day = 0; day < 365; day++) {
      const at = new Date(Date.now() + day * 86_400_000);
      if (selectMissionRotation(candidates, at, TZ).some((m) => m.id === missionId)) {
        missionNow = at;
        break;
      }
    }
    if (!missionNow) throw new Error("La mission de test n'a jamais été sélectionnée");
    shopItemId = (
      await prisma.shopItem.create({
        data: {
          slug: `test-${tag}`,
          name: { fr: "test", en: "" },
          description: { fr: "", en: "" },
          lotId,
          priceZeni: 300,
          perUserLimit: 1,
          limitPeriod: "ONCE",
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    const where = { userId: { in: users } };
    await prisma.$transaction([
      prisma.userMission.deleteMany({ where }),
      prisma.purchase.deleteMany({ where }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: users } }, { refereeId: { in: users } }] } }),
      prisma.notification.deleteMany({ where }),
      prisma.boosterCredit.deleteMany({ where }),
      prisma.discovery.deleteMany({ where }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    if (missionId) await prisma.mission.deleteMany({ where: { id: missionId } });
    if (shopItemId) await prisma.shopItem.deleteMany({ where: { id: shopItemId } });
    if (lotId) await prisma.lot.deleteMany({ where: { id: lotId } });
    await prisma.$disconnect();
  }, 60_000);

  it("50 débits simultanés de 100 sur un solde de 1 000 : exactement 10 passent, jamais sous zéro", async () => {
    const { id } = await player();
    const attempts = await Promise.allSettled(
      Array.from({ length: 50 }, () => prisma.$transaction((tx) => debit(tx, { userId: id, amount: 100, reason: "SHOP" }))),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled").length;
    for (const r of attempts.filter((a) => a.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(LedgerError);
    }
    expect(ok).toBe(10);
    expect((await prisma.user.findUniqueOrThrow({ where: { id }, select: { coins: true } })).coins).toBe(0);
    expect(await balanceMatchesLedger(id)).toBe(true);
  }, 120_000);

  it("20 réclamations simultanées d'une mission : une seule récompense", async () => {
    const { id } = await player();
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => claimMissionWith(prisma, { userId: id, missionId, now: missionNow, timeZone: TZ }, deps)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const r of attempts.filter((a) => a.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(MissionError);
    }
    const [user, credit, cards, claims] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id }, select: { coins: true } }),
      prisma.boosterCredit.findUnique({ where: { userId_boosterTypeId: { userId: id, boosterTypeId: standardId } } }),
      prisma.userCard.count({ where: { ownerId: id } }),
      prisma.userMission.count({ where: { userId: id } }),
    ]);
    expect(user.coins).toBe(START + 100);
    expect(credit?.count).toBe(1);
    expect(cards).toBe(1);
    expect(claims).toBe(1);
    expect(await balanceMatchesLedger(id)).toBe(true);
  }, 120_000);

  it("20 achats simultanés d'un article limité à 1 : un seul achat, un seul débit", async () => {
    const { id } = await player();
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        buyWithZeniWith(prisma, { userId: id, shopItemId, expectedPrice: 300, now: new Date(), timeZone: TZ }, deps),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const r of attempts.filter((a) => a.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ShopError);
    }
    const [user, purchases] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id }, select: { coins: true } }),
      prisma.purchase.findMany({ where: { userId: id }, select: { status: true } }),
    ]);
    expect(purchases).toEqual([{ status: "PAID" }]);
    expect(user.coins).toBe(START - 300 + 100); // prix payé, Zeni du lot reçus
    expect(await balanceMatchesLedger(id)).toBe(true);
  }, 120_000);

  it("un prix changé depuis l'affichage est refusé sans rien débiter", async () => {
    const { id } = await player();
    await expect(
      buyWithZeniWith(prisma, { userId: id, shopItemId, expectedPrice: 1, now: new Date(), timeZone: TZ }, deps),
    ).rejects.toMatchObject({ code: "STALE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id }, select: { coins: true } })).coins).toBe(START);
  }, 60_000);

  it("parrainage : deux rattachements simultanés n'en gardent qu'un, deux réclamations n'en paient qu'une", async () => {
    const [referrer, other, referee] = [await player(), await player(), await player()];
    const attempts = await Promise.allSettled([
      attachReferralWith(prisma, { refereeId: referee.id, code: referrer.referralCode, now: new Date(), rules }),
      attachReferralWith(prisma, { refereeId: referee.id, code: other.referralCode, now: new Date(), rules }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((a) => a.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ReferralError);
    expect(rejected.reason.code).toBe("ALREADY_REFERRED");

    const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: referee.id } });
    // Rien n'est versé avant la qualification
    await expect(
      claimReferralWith(prisma, { userId: referral.referrerId, referralId: referral.id, lotId, now: new Date() }, deps),
    ).rejects.toMatchObject({ code: "NOT_QUALIFIED" });

    await prisma.referral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date() } });
    const claims = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        claimReferralWith(prisma, { userId: referral.referrerId, referralId: referral.id, lotId, now: new Date() }, deps),
      ),
    );
    expect(claims.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    // Un tiers ne réclame pas à la place du filleul
    await expect(
      claimReferralWith(prisma, { userId: other.id === referral.referrerId ? referrer.id : other.id, referralId: referral.id, lotId, now: new Date() }, deps),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    for (const id of [referrer.id, other.id, referee.id]) expect(await balanceMatchesLedger(id)).toBe(true);
  }, 120_000);

  it("la somme des soldes des joueurs de test égale la somme de leur journal", async () => {
    const [coins, ledger] = await Promise.all([
      prisma.user.aggregate({ where: { id: { in: users } }, _sum: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId: { in: users } }, _sum: { amount: true } }),
    ]);
    expect(coins._sum.coins).toBe(ledger._sum.amount);
  }, 60_000);
});
