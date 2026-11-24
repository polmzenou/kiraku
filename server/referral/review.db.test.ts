import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_REFERRAL_V2_RULES, type ReferralV2Rules } from "@/lib/referral/rules";
import { createPgAdapter } from "@/server/pg-adapter";
import { consumeBoosters } from "../economy/credits";
import { debit } from "../economy/ledger";
import type { LotDeps } from "../economy/lots";
import { attachReferralV2With } from "./attach-core";
import { fingerprintKey, refereeFingerprints } from "./fingerprint";
import { payDueRewardsWith } from "./payout-core";
import { progressReferralWith, type ProgressDeps } from "./progress-core";
import { previewRevokeWith, revokeReferralWith, validateReferralWith } from "./review-core";

vi.mock("server-only", () => ({}));

// Décisions de l'équipe sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/review.db.test.ts
// « Révoquer et bannir » reprend tout ce qui reste (journal = solde, crédits jamais négatifs), une deuxième reprise
// n'a pas d'effet, une révocation simple ne reprend rien, une reprise en même temps qu'un versement reste juste.

const url = process.env.DATABASE_URL_TEST;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const lotDeps: LotDeps = { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) };
const KEY = fingerprintKey("secret-de-test-assez-long-pour-auth-secret");
const T0 = new Date(Math.floor((Date.now() - 20 * DAY) / DAY) * DAY + 10 * HOUR);

describe.skipIf(!url)("décisions de l'équipe sur un parrainage (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const users: Record<string, { id: string; code: string }> = {};
  const lots: string[] = [];
  const types: string[] = [];
  const emails: string[] = [];
  let rules: ReferralV2Rules;
  let creditType: string;

  const deps = (now: Date): ProgressDeps => ({ rules, now, sharedCap: 4, ennichiMultiplier: 1, lotDeps, timeZone: "Europe/Paris" });
  const attach = (referee: string, referrer: string) =>
    attachReferralV2With(prisma, { refereeId: users[referee].id, code: users[referrer].code, now: T0, rules, attachWindowDays: 7, ennichiEdition: null, fingerprintKey: KEY });
  const state = async (name: string) => {
    const id = users[name].id;
    const [user, ledger, credits] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id }, select: { coins: true, bannedAt: true } }),
      prisma.coinTransaction.aggregate({ where: { userId: id }, _sum: { amount: true } }),
      prisma.boosterCredit.findMany({ where: { userId: id }, select: { count: true } }),
    ]);
    return { coins: user.coins, ledger: ledger._sum.amount ?? 0, banned: user.bannedAt !== null, credits: credits.reduce((s, c) => s + c.count, 0), minCredit: Math.min(0, ...credits.map((c) => c.count)) };
  };
  const type = async (kind: "STANDARD" | "DROP") =>
    (
      await prisma.boosterType.create({
        data: {
          slug: `test-ref-${kind.toLowerCase()}-${tag}`,
          kind,
          includeCustom: false,
          family: "special",
          name: { fr: "Test" },
          tagline: { fr: "Test" },
          emblem: "試",
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
        select: { id: true },
      })
    ).id;
  const lot = async (zeni: number, items: { boosterTypeId: string; quantity: number }[] = []) => {
    const id = (await prisma.lot.create({ data: { name: { fr: `test-ref-${tag}`, en: "" }, zeni, items: { create: items.map((i) => ({ kind: "BOOSTER" as const, ...i })) } }, select: { id: true } })).id;
    lots.push(id);
    return id;
  };

  beforeAll(async () => {
    for (const name of ["par", "lea", "max", "zoe", "staff"]) {
      const email = `${name}.${tag}@exemple.fr`;
      emails.push(email);
      const u = await prisma.user.create({
        data: { username: `test-rev-${name}-${tag}`, isGuest: false, email, emailVerified: T0, registeredAt: new Date(T0.getTime() - HOUR), role: name === "staff" ? "DEV" : "USER" },
        select: { id: true, referralCode: true },
      });
      users[name] = { id: u.id, code: u.referralCode };
    }
    creditType = await type("STANDARD");
    const dropType = await type("DROP");
    types.push(creditType, dropType);
    const step1Referee = await lot(500, [{ boosterTypeId: creditType, quantity: 3 }, { boosterTypeId: dropType, quantity: 1 }]);
    rules = {
      ...DEFAULT_REFERRAL_V2_RULES,
      enabled: true,
      stepLots: [
        { referee: step1Referee, referrer: await lot(300), referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
        { referee: null, referrer: null, referrerTrust: null },
      ],
      milestones: [{ installed: 1, lotId: await lot(1000), choiceVouchers: 1, oneOfOne: false, ambassador: false, legend: false }],
    };
  }, 60_000);

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    const prints = emails.flatMap((email) => refereeFingerprints({ discordId: null, email }, KEY));
    await prisma.$transaction([
      prisma.adminLog.deleteMany({ where: { adminId: { in: ids } } }),
      prisma.networkBan.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdById: { in: ids } }] } }),
      prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
      prisma.voucher.deleteMany({ where: { userId: { in: ids } } }),
      prisma.referralReward.deleteMany({ where: { userId: { in: ids } } }),
      prisma.refereeFingerprint.deleteMany({ where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { refereeId: { in: ids } }] } }),
      prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } }),
      prisma.boosterCredit.deleteMany({ where: { userId: { in: ids } } }),
      prisma.sealedDrop.deleteMany({ where: { ownerId: { in: ids } } }),
      prisma.boosterOpening.deleteMany({ where: { userId: { in: ids } } }),
      prisma.lot.deleteMany({ where: { id: { in: lots } } }),
      prisma.boosterType.deleteMany({ where: { id: { in: types } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("révoquer et bannir reprend ce qui reste, sans jamais descendre sous zéro ; journal = solde", async () => {
    const { referralId } = await attach("lea", "par");
    // Étape 2 posée à la main : Léa installée, le palier de Tristren tombe
    await progressReferralWith(prisma, referralId, deps(new Date(T0.getTime() + HOUR)));
    await prisma.referral.update({ where: { id: referralId }, data: { step2At: new Date(T0.getTime() + 2 * DAY) } });
    await payDueRewardsWith(prisma, referralId, deps(new Date(T0.getTime() + 3 * DAY)));
    expect(await state("lea")).toMatchObject({ coins: 500, credits: 3 });
    expect((await state("par")).coins).toBe(300 + 1000);
    expect(await prisma.sealedDrop.count({ where: { ownerId: users.lea.id } })).toBe(1);
    expect(await prisma.voucher.count({ where: { userId: users.par.id } })).toBe(1);

    // Léa a déjà dépensé 200 Zeni et ouvert un crédit : on reprend ce qui reste
    await prisma.$transaction(async (tx) => {
      await debit(tx, { userId: users.lea.id, amount: 200, reason: "BOOSTER", refId: "test", now: T0 });
      await consumeBoosters(tx, users.lea.id, creditType, 1);
    });
    // L'aperçu de la confirmation annonce exactement ce que la reprise prendra, palier compris
    const preview = await previewRevokeWith(prisma, referralId);
    expect(preview?.milestones).toEqual([1]);
    const outcome = await revokeReferralWith(prisma, { staffId: users.staff.id, referralId, ban: true, reason: "triche (test)", now: new Date(T0.getTime() + 4 * DAY), sharedIpCap: 4 });
    expect(outcome.banned.sort()).toEqual([users.lea.id, users.par.id].sort());
    const byUser = (list: { userId: string }[]) => [...list].sort((a, b) => a.userId.localeCompare(b.userId));
    expect(byUser(preview!.reports)).toEqual(byUser(outcome.reports));
    expect(await previewRevokeWith(prisma, referralId)).toBeNull();

    const lea = await state("lea");
    expect(lea).toMatchObject({ coins: 0, credits: 0, banned: true, minCredit: 0 });
    expect(lea.ledger).toBe(lea.coins);
    const par = await state("par");
    expect(par).toMatchObject({ coins: 0, banned: true });
    expect(par.ledger).toBe(par.coins);
    expect(await prisma.sealedDrop.count({ where: { ownerId: users.lea.id } })).toBe(0);
    expect(await prisma.voucher.count({ where: { userId: users.par.id } })).toBe(0);
    expect(await prisma.referralReward.count({ where: { userId: { in: [users.lea.id, users.par.id] }, clawedBackAt: null } })).toBe(0);
    const leaReport = outcome.reports.find((r) => r.userId === users.lea.id);
    expect(leaReport?.taken.missing).toMatchObject({ zeni: 200, credits: { [creditType]: 1 } });
  });

  it("une deuxième reprise est refusée et ne change rien", async () => {
    const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: users.lea.id }, select: { id: true } });
    const before = await state("lea");
    await expect(revokeReferralWith(prisma, { staffId: users.staff.id, referralId: referral.id, ban: true, reason: "encore", now: new Date(), sharedIpCap: 4 })).rejects.toMatchObject({ code: "ALREADY_REVOKED" });
    expect(await state("lea")).toEqual(before);
  });

  it("révoquer sans bannir arrête les versements et ne reprend rien", async () => {
    const { referralId } = await attach("max", "staff");
    await prisma.referral.update({ where: { id: referralId }, data: { heldAt: T0, holdReason: "SCORE" } });
    await progressReferralWith(prisma, referralId, deps(new Date(T0.getTime() + HOUR)));
    expect(await prisma.referralReward.count({ where: { referralId } })).toBe(0);
    await revokeReferralWith(prisma, { staffId: users.par.id, referralId, ban: false, reason: "doute", now: new Date(T0.getTime() + 2 * HOUR), sharedIpCap: 4 });
    expect(await payDueRewardsWith(prisma, referralId, deps(new Date(T0.getTime() + 3 * HOUR)))).toBe(0);
    expect(await state("max")).toMatchObject({ coins: 0, banned: false });
  });

  it("une reprise lancée en même temps qu'une validation reste juste : rien n'échappe à la reprise", async () => {
    const { referralId } = await attach("zoe", "staff");
    await prisma.referral.update({ where: { id: referralId }, data: { heldAt: T0, holdReason: "SCORE" } });
    await progressReferralWith(prisma, referralId, deps(new Date(T0.getTime() + HOUR)));
    const now = new Date(T0.getTime() + 2 * HOUR);
    await Promise.allSettled([
      validateReferralWith(prisma, { staffId: users.par.id, referralId, note: null, now }, deps(now)),
      revokeReferralWith(prisma, { staffId: users.par.id, referralId, ban: true, reason: "triche", now, sharedIpCap: 4 }),
    ]);
    // Quel que soit l'ordre : parrainage révoqué, aucun versement non repris, journal = solde, aucun crédit négatif
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referralId }, select: { revokedAt: true } })).revokedAt).not.toBeNull();
    expect(await prisma.referralReward.count({ where: { referralId, clawedBackAt: null } })).toBe(0);
    const zoe = await state("zoe");
    expect(zoe.ledger).toBe(zoe.coins);
    expect(zoe.minCredit).toBe(0);
  });
});
