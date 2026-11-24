import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_REFERRAL_V2_RULES, type ReferralV2Rules } from "@/lib/referral/rules";
import { createPgAdapter } from "@/server/pg-adapter";
import { anonymizeUserWith } from "../account/account-core";
import type { LotDeps } from "../economy/lots";
import { attachReferralV2With, ReferralV2Error } from "./attach-core";
import { fingerprintKey, refereeFingerprints } from "./fingerprint";
import { checkReferralLocks } from "./locks";
import { payDueRewardsWith } from "./payout-core";
import { progressReferralWith, type ProgressDeps } from "./progress-core";

vi.mock("server-only", () => ({}));

// Parrainage v2 sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/referral/referral.db.test.ts
// Rattachement, étapes et versements lancés en parallèle : un seul versement par étape et par côté, une seule
// notification ; rattachements simultanés d'un même filleul ; appareil commun puis validation ; empreinte gardée
// après la suppression du compte. Joueurs et lots jetables, supprimés à la fin.

const url = process.env.DATABASE_URL_TEST;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const lotDeps: LotDeps = { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) };
const KEY = fingerprintKey("secret-de-test-assez-long-pour-auth-secret");
// Début de l'essai, assez loin dans le passé pour que toutes les étapes soient datées avant `now`
const T0 = new Date(Math.floor((Date.now() - 20 * DAY) / DAY) * DAY + 10 * HOUR);

describe.skipIf(!url)("parrainage v2 (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  const users: Record<string, { id: string; code: string }> = {};
  const lots: Record<string, string> = {};
  let rules: ReferralV2Rules;
  const emails: string[] = [];

  const deps = (now: Date): ProgressDeps => ({ rules, now, sharedCap: 4, ennichiMultiplier: 2, lotDeps, timeZone: "Europe/Paris" });
  const attach = (referee: string, referrer: string, now = T0) =>
    attachReferralV2With(prisma, {
      refereeId: users[referee].id,
      code: users[referrer].code,
      now,
      rules,
      attachWindowDays: 7,
      ennichiEdition: null,
      fingerprintKey: KEY,
    });
  const coins = async (name: string) => (await prisma.user.findUniqueOrThrow({ where: { id: users[name].id }, select: { coins: true } })).coins;
  const openings = (name: string, perDay: number, days: number) =>
    prisma.boosterOpening.createMany({
      data: Array.from({ length: perDay * days }, (_, i) => ({
        userId: users[name].id,
        boosterSlug: "standard",
        cardIds: [],
        catalogCardIds: [],
        source: "FREE" as const,
        createdAt: new Date(T0.getTime() + Math.floor(i / perDay) * DAY + HOUR + (i % perDay) * 60_000),
      })),
    });

  beforeAll(async () => {
    for (const name of ["par", "lea", "papi", "max", "a1", "a2", "cible", "ghost", "ghost2", "mue", "mue2"]) {
      // ghost.player.<tag>+v2@gmail.com et ghostplayer<tag>@gmail.com arrivent dans la même boîte
      const email = name === "ghost" ? `ghost.player.${tag}+v2@gmail.com` : name === "ghost2" ? `ghostplayer${tag}@gmail.com` : `${name}.${tag}@exemple.fr`;
      emails.push(email);
      const u = await prisma.user.create({
        data: { username: `test-ref-${name}-${tag}`, isGuest: false, email, emailVerified: T0, registeredAt: new Date(T0.getTime() - HOUR), createdAt: new Date(T0.getTime() - HOUR) },
        select: { id: true, referralCode: true },
      });
      users[name] = { id: u.id, code: u.referralCode };
    }
    // Lots en Zeni seulement, chacun d'un montant différent : on lit qui a reçu quoi dans les soldes
    for (const [key, zeni] of Object.entries({ l1ref: 101, l1par: 102, l1trust: 103, l2ref: 201, l2par: 202, l2trust: 203, l3ref: 301, l3par: 302, l4ref: 401, l4par: 402, grand: 500, palier: 1000 })) {
      lots[key] = (await prisma.lot.create({ data: { name: { fr: `test-${key}-${tag}`, en: "" }, zeni }, select: { id: true } })).id;
    }
    rules = {
      ...DEFAULT_REFERRAL_V2_RULES,
      enabled: true,
      stepLots: [
        { referee: lots.l1ref, referrer: lots.l1par, referrerTrust: lots.l1trust },
        { referee: lots.l2ref, referrer: lots.l2par, referrerTrust: lots.l2trust },
        { referee: lots.l3ref, referrer: lots.l3par, referrerTrust: null },
        { referee: lots.l4ref, referrer: lots.l4par, referrerTrust: null },
      ],
      grandLotId: lots.grand,
      milestones: [{ installed: 1, lotId: lots.palier, choiceVouchers: 1, oneOfOne: false, ambassador: false, legend: false }],
    };
  }, 60_000);

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    const prints = emails.flatMap((email) => refereeFingerprints({ discordId: null, email }, KEY));
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
      prisma.voucher.deleteMany({ where: { userId: { in: ids } } }),
      prisma.referralReward.deleteMany({ where: { userId: { in: ids } } }),
      prisma.refereeFingerprint.deleteMany({ where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { refereeId: { in: ids } }] } }),
      prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } }),
      prisma.boosterOpening.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userSignal.deleteMany({ where: { userId: { in: ids } } }),
      prisma.lot.deleteMany({ where: { id: { in: Object.values(lots) } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("étape 1 lancée trois fois en parallèle : un versement par côté, une notification, pas de part « confiance »", async () => {
    // Papi a parrainé Tristren : il sera grand-parrain de Léa
    await prisma.referral.create({ data: { referrerId: users.papi.id, refereeId: users.par.id, createdAt: new Date(T0.getTime() - 30 * DAY), version: 2, step1At: new Date(T0.getTime() - 30 * DAY) } });
    await prisma.user.update({ where: { id: users.par.id }, data: { referredById: users.papi.id } });

    const { referralId } = await attach("lea", "par");
    const referral = await prisma.referral.findUniqueOrThrow({ where: { id: referralId }, select: { version: true, grandReferrerId: true } });
    expect(referral).toEqual({ version: 2, grandReferrerId: users.papi.id });

    const now = new Date(T0.getTime() + HOUR);
    await Promise.all([1, 2, 3].map(() => progressReferralWith(prisma, referralId, deps(now))));
    const rewards = await prisma.referralReward.findMany({ where: { referralId }, select: { id: true, kind: true, side: true, step: true } });
    expect(rewards.map((r) => `${r.kind}:${r.side}:${r.step}`).sort()).toEqual(["STEP:REFEREE:1", "STEP:REFERRER:1"]);
    expect(await coins("lea")).toBe(101);
    expect(await coins("par")).toBe(102);
    for (const r of rewards) expect(await prisma.notification.count({ where: { refId: r.id, type: "REFERRAL_REWARD" } })).toBe(1);
  });

  it("étapes 2 et 3 en parallèle : versées une fois, part « confiance » libérée à l'étape 3, palier et grand-parrainage", async () => {
    const referral = await prisma.referral.findUniqueOrThrow({ where: { refereeId: users.lea.id }, select: { id: true } });
    await openings("lea", 4, 5); // 20 ouvertures de la réserve sur 5 jours
    const now = new Date(T0.getTime() + 7 * DAY);
    await Promise.all([1, 2].map(() => progressReferralWith(prisma, referral.id, deps(now))));
    await Promise.all([1, 2].map(() => payDueRewardsWith(prisma, referral.id, deps(now))));

    const steps = await prisma.referral.findUniqueOrThrow({ where: { id: referral.id }, select: { step2At: true, step3At: true, step4At: true } });
    expect(steps.step2At).not.toBeNull();
    expect(steps.step3At).not.toBeNull();
    expect(steps.step4At).toBeNull();
    expect(await coins("lea")).toBe(101 + 201 + 301);
    expect(await coins("par")).toBe(102 + 103 + 202 + 203 + 302 + 1000);
    expect(await coins("papi")).toBe(500);
    expect(await prisma.voucher.count({ where: { userId: users.par.id, kind: "MYTHIC_CHOICE" } })).toBe(1);
    const rows = await prisma.referralReward.groupBy({ by: ["kind", "side", "step", "milestone"], where: { OR: [{ referralId: referral.id }, { userId: users.par.id }] }, _count: true });
    expect(rows.every((r) => r._count === 1)).toBe(true);
    // Aucun versement ne notifie deux fois
    const notified = await prisma.notification.groupBy({ by: ["refId"], where: { type: "REFERRAL_REWARD", userId: { in: [users.lea.id, users.par.id, users.papi.id] } }, _count: true });
    expect(notified.every((n) => n._count === 1)).toBe(true);
  });

  it("appareil commun : rien n'est versé avant la décision, la validation verse tout ce qui était dû", async () => {
    const value = `test-device-${tag}`;
    await prisma.userSignal.createMany({
      data: [users.par.id, users.max.id].map((userId) => ({ userId, kind: "DEVICE" as const, value, firstEvent: "LOGIN" as const })),
    });
    const { referralId } = await attach("max", "par");
    const now = new Date(T0.getTime() + 2 * HOUR);
    await progressReferralWith(prisma, referralId, deps(now));
    const held = await prisma.referral.findUniqueOrThrow({ where: { id: referralId }, select: { heldAt: true, holdReason: true, step1At: true } });
    expect(held.holdReason).toBe("DEVICE");
    expect(held.step1At).not.toBeNull();
    expect(await prisma.referralReward.count({ where: { referralId } })).toBe(0);

    await prisma.referral.update({ where: { id: referralId }, data: { reviewedAt: now, reviewedById: users.papi.id, reviewDecision: "VALIDATED" } });
    expect(await payDueRewardsWith(prisma, referralId, deps(now))).toBe(2);
    expect(await coins("max")).toBe(101);
  });

  it("deux rattachements simultanés d'un même filleul : un seul est gardé", async () => {
    const results = await Promise.allSettled([attach("cible", "a1"), attach("cible", "a2")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(ReferralV2Error);
    expect((refused.reason as ReferralV2Error).code).toBe("ALREADY_REFERRED");
    expect(await prisma.referral.count({ where: { refereeId: users.cible.id } })).toBe(1);
  });

  it("l'empreinte de l'e-mail survit à la suppression du compte : la même boîte n'est pas filleule deux fois", async () => {
    await attach("ghost", "a1");
    await prisma.user.delete({ where: { id: users.ghost.id } });
    const prints = refereeFingerprints({ discordId: null, email: emails[7] }, KEY);
    expect(await prisma.refereeFingerprint.findMany({ where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) }, select: { referralId: true } })).toEqual([{ referralId: null }]);
    await expect(attach("ghost2", "a2")).rejects.toMatchObject({ code: "ALREADY_REFERRED" });
  });

  it("un filleul change d'e-mail puis est anonymisé : sa nouvelle boîte n'est pas filleule une deuxième fois", async () => {
    await attach("mue", "a1");
    const fresh = `nouvelle.${tag}@exemple.fr`;
    emails.push(fresh);
    await prisma.user.update({ where: { id: users.mue.id }, data: { email: fresh } });
    expect(await anonymizeUserWith(prisma, { userId: users.mue.id, now: new Date(), fingerprintKey: KEY })).toBe(true);

    // Un compte neuf avec cette boîte (libérée par l'anonymisation) est reconnu
    await prisma.user.update({ where: { id: users.mue2.id }, data: { email: fresh } });
    await expect(attach("mue2", "a2")).rejects.toMatchObject({ code: "ALREADY_REFERRED" });
  });

  it("verrous : cartes du filleul 14 jours, rien vers le parrain 30 jours, réglage de l'admin respecté", async () => {
    // Léa est rattachée à Tristren depuis T0
    const check = (actor: string, other: string | null, ownItems: boolean, mutual: boolean, days: number) =>
      checkReferralLocks(prisma, { actorId: users[actor].id, counterpartyId: other ? users[other].id : null, ownItems, mutual, now: new Date(T0.getTime() + days * DAY) });
    expect(await check("lea", null, true, true, 13.9)).toBe("REFEREE_LOCKED");
    expect(await check("lea", null, true, true, 14)).toBeNull();
    expect(await check("lea", "par", false, false, 29.9)).toBe("PAIR_LOCKED");
    expect(await check("lea", "par", false, false, 30)).toBeNull();
    // Le parrain peut offrir à son filleul ; une vente entre eux est verrouillée dans les deux sens
    expect(await check("par", "lea", true, false, 20)).toBeNull();
    expect(await check("par", "lea", true, true, 20)).toBe("PAIR_LOCKED");
    expect(await check("a1", "a2", true, true, 1)).toBeNull();
    // Réglage de l'admin lu dans la transaction
    await prisma.gameSetting.upsert({ where: { key: "referral.v2.cardLockDays" }, create: { key: "referral.v2.cardLockDays", value: 3 }, update: { value: 3 } });
    try {
      expect(await check("lea", null, true, false, 5)).toBeNull();
    } finally {
      await prisma.gameSetting.delete({ where: { key: "referral.v2.cardLockDays" } });
    }
  });

  it("refus : soi-même, code inconnu, cycle même lointain", async () => {
    await expect(attach("par", "par")).rejects.toMatchObject({ code: "SELF" });
    await expect(attachReferralV2With(prisma, { refereeId: users.a1.id, code: "ZZZZ2222", now: T0, rules, attachWindowDays: 7, ennichiEdition: null, fingerprintKey: KEY })).rejects.toMatchObject({ code: "INVALID_CODE" });
    // Papi → Tristren → Léa : Papi ne peut pas devenir le filleul de Léa
    await expect(attach("papi", "lea")).rejects.toMatchObject({ code: "INVALID_CODE" });
  });
});
