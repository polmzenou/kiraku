import { randomBytes, randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyOmikuji } from "@/lib/ennichi/omikuji";
import type { EnnichiRules } from "@/lib/ennichi/rules";
import { createPgAdapter } from "@/server/pg-adapter";
import type { LotDeps } from "../economy/lots";
import { commitSeedWith, drawEnnichiWith, EnnichiCloseError, payAwardsWith } from "./close-core";
import { catchUpTiersWith, grantTierWith, lanternCountsWith, pendingCountWith, recordReachedTiersWith, sendTierWith } from "./lanterns-core";

vi.mock("server-only", () => ({}));

// Ennichi sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/ennichi/ennichi.db.test.ts
// Lanternes posées et allumées (révoqués et bloqués à part), paliers figés, lot d'un palier versé une seule fois même
// quand l'envoi et le rattrapage tournent ensemble, limite par IP, tirage lancé deux fois en même temps (un seul
// résultat), banzuke sans les parrainages bloqués ni révoqués, prix versés une fois, tirage refait à l'identique.

const url = process.env.DATABASE_URL_TEST;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const lotDeps: LotDeps = { rng: () => 0, loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) };

describe.skipIf(!url)("Ennichi (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(3).toString("hex");
  // Édition propre au test : rien ne croise les autres essais
  const edition = 100 + randomInt(0, 800);
  const now = new Date();
  // Fête finie depuis un jour : clôture en cours
  const startsAt = new Date(now.getTime() - 15 * DAY);
  const during = new Date(startsAt.getTime() + 2 * DAY);
  const users: Record<string, string> = {};
  const lots: Record<string, string> = {};
  let rules: EnnichiRules;

  const coins = async (name: string) => (await prisma.user.findUniqueOrThrow({ where: { id: users[name] }, select: { coins: true } })).coins;
  const schedule = () => ({ startsAt, endsAt: new Date(startsAt.getTime() + 14 * DAY), closesAt: new Date(startsAt.getTime() + 17 * DAY) });
  const deps = () => ({ lotDeps, now });

  beforeAll(async () => {
    const names = ["papa", "mama", "solo", "f1", "f2", "f3", "f4", "f5", "held", "revoked", "late", "guest", "unverified", "lazy", "ip1", "ip2", "ip3"];
    for (const name of names) {
      users[name] = (
        await prisma.user.create({
          data: {
            username: `test-enn-${name}-${tag}`,
            isGuest: name === "guest",
            emailVerified: name === "unverified" || name === "guest" ? null : startsAt,
            registeredAt: new Date(startsAt.getTime() - DAY + names.indexOf(name) * 1000),
          },
          select: { id: true },
        })
      ).id;
    }
    for (const [key, zeni] of Object.entries({ t0: 10, t1: 20, r1: 1000, r2: 500, rest: 50, divin: 7, myth: 3 })) {
      lots[key] = (await prisma.lot.create({ data: { name: { fr: `test-enn-${key}-${tag}`, en: "" }, zeni }, select: { id: true } })).id;
    }
    rules = {
      enabled: true,
      edition,
      startsAt,
      days: 14,
      closingDays: 3,
      stepMultiplier: 2,
      liftCap: true,
      tiers: [
        { lanterns: 2, lotId: lots.t0, choiceVouchers: 0 },
        { lanterns: 4, lotId: lots.t1, choiceVouchers: 1 },
        { lanterns: 50, lotId: null, choiceVouchers: 0 },
        { lanterns: 100, lotId: null, choiceVouchers: 0 },
      ],
      ranks: [
        { from: 1, to: 1, title: "yokozuna", lotId: lots.r1, choiceVouchers: 1, oneOfOne: true },
        { from: 2, to: 2, title: "ozeki", lotId: lots.r2, choiceVouchers: 0, oneOfOne: false },
        { from: 3, to: 10, title: null, lotId: lots.rest, choiceVouchers: 0, oneOfOne: false },
      ],
      omikuji: [
        { lotId: null, oneOfOne: true, count: 1 },
        { lotId: lots.divin, oneOfOne: false, count: 2 },
        { lotId: lots.myth, oneOfOne: false, count: 10 },
      ],
      tierGrantsPerIp: 2,
    };
    // Parrainages de la fête : papa en installe 3, mama 2 (dont la 2e plus tôt que la 3e de papa), solo 1 ;
    // un bloqué, un révoqué, et un installé après la clôture ne comptent pas
    const link = (referrer: string, referee: string, step2At: Date | null, extra: Record<string, unknown> = {}) =>
      prisma.referral.create({
        data: { referrerId: users[referrer], refereeId: users[referee], version: 2, ennichiEdition: edition, createdAt: during, step1At: during, step2At, ...extra },
        select: { id: true },
      });
    await link("papa", "f1", new Date(during.getTime() + 1 * HOUR));
    await link("papa", "f2", new Date(during.getTime() + 2 * HOUR));
    await link("papa", "f3", new Date(during.getTime() + 9 * HOUR));
    await link("mama", "f4", new Date(during.getTime() + 3 * HOUR));
    await link("mama", "f5", new Date(during.getTime() + 4 * HOUR));
    await link("solo", "lazy", new Date(during.getTime() + 5 * HOUR));
    await link("papa", "held", new Date(during.getTime() + 6 * HOUR), { heldAt: during, holdReason: "DEVICE" });
    await link("mama", "revoked", new Date(during.getTime() + 7 * HOUR), { revokedAt: during, reviewedAt: during, reviewDecision: "REVOKED" });
    await link("solo", "late", null);
    // Joueurs actifs pendant la fête (une ouverture), sauf « lazy »
    const active = names.filter((n) => n !== "lazy");
    await prisma.boosterOpening.createMany({
      data: active.map((n) => ({ userId: users[n], boosterSlug: "standard", cardIds: [], catalogCardIds: [], source: "FREE" as const, createdAt: new Date(during.getTime() + 30 * 60_000) })),
    });
    // Trois comptes sur la même IP
    await prisma.userSignal.createMany({
      data: ["ip1", "ip2", "ip3"].map((n) => ({ userId: users[n], kind: "IP" as const, value: `203.0.113.${tag.length}`, firstEvent: "LOGIN" as const })),
    });
    await commitSeedWith(prisma, edition, startsAt);
  }, 60_000);

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
      prisma.coinTransaction.deleteMany({ where: { userId: { in: ids } } }),
      prisma.voucher.deleteMany({ where: { userId: { in: ids } } }),
      prisma.ennichiTierGrant.deleteMany({ where: { edition } }),
      prisma.ennichiAward.deleteMany({ where: { edition } }),
      prisma.ennichiResult.deleteMany({ where: { edition } }),
      prisma.ennichiTierReached.deleteMany({ where: { edition } }),
      prisma.ennichiDraw.deleteMany({ where: { edition } }),
      prisma.cosmetic.deleteMany({ where: { slug: { startsWith: `ennichi-${edition}-` } } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { refereeId: { in: ids } }] } }),
      prisma.boosterOpening.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userSignal.deleteMany({ where: { userId: { in: ids } } }),
      prisma.lot.deleteMany({ where: { id: { in: Object.values(lots) } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("lanternes : posées par les amis de la fête, allumées par les installés (bloqués et révoqués à part)", async () => {
    // 8 posées (le révoqué ne compte pas) ; 6 allumées (ni le bloqué, ni celui qui n'est pas installé)
    expect(await lanternCountsWith(prisma, edition, now)).toEqual({ placed: 8, lit: 6 });
    expect(await recordReachedTiersWith(prisma, rules, 6, now)).toEqual([0, 1]);
    // Un palier atteint se fige une fois : rien de nouveau au passage suivant
    expect(await recordReachedTiersWith(prisma, { ...rules, tiers: rules.tiers.map((t) => ({ ...t, lotId: null })) }, 6, now)).toEqual([]);
    const frozen = await prisma.ennichiTierReached.findMany({ where: { edition }, orderBy: { tier: "asc" }, select: { lotId: true, choiceVouchers: true } });
    expect(frozen).toEqual([{ lotId: lots.t0, choiceVouchers: 0 }, { lotId: lots.t1, choiceVouchers: 1 }]);
  });

  it("le lot d'un palier part une seule fois, même quand l'envoi et le rattrapage tournent ensemble", async () => {
    const input = { edition, schedule: schedule(), perIp: rules.tierGrantsPerIp };
    await Promise.all([
      sendTierWith(prisma, { ...input, tier: 0, deadline: Date.now() + 60_000, batch: 3 }, deps()),
      sendTierWith(prisma, { ...input, tier: 0, deadline: Date.now() + 60_000, batch: 5 }, deps()),
      catchUpTiersWith(prisma, { ...input, userId: users.papa }, deps()),
      catchUpTiersWith(prisma, { ...input, userId: users.mama }, deps()),
    ]);
    const grants = await prisma.ennichiTierGrant.findMany({ where: { edition, tier: 0 }, select: { userId: true, granted: true } });
    const byUser = new Map(grants.map((g) => [g.userId, g.granted as Record<string, unknown>]));
    // Une ligne par joueur ; ni l'invité, ni le compte non vérifié, ni celui qui n'a rien ouvert
    expect(grants.length).toBe(byUser.size);
    for (const n of ["guest", "unverified", "lazy"]) expect(byUser.has(users[n])).toBe(false);
    for (const n of ["papa", "mama", "solo", "f1", "f2"]) expect(byUser.get(users[n])).toMatchObject({ zeni: 10 });
    // Trois comptes sur la même IP : deux servis, le troisième écarté
    const sameIp = ["ip1", "ip2", "ip3"].map((n) => byUser.get(users[n]));
    expect(sameIp.filter((g) => g?.skipped === "IP_LIMIT")).toHaveLength(1);
    expect(sameIp.filter((g) => g?.zeni === 10)).toHaveLength(2);
    // Le rattrapage de papa lui a aussi versé le palier 1, déjà atteint : 10 + 20 Zeni, deux notifications
    expect(await coins("papa")).toBe(30);
    expect(await prisma.notification.count({ where: { userId: users.papa, type: "ENNICHI_REWARD" } })).toBe(2);
    const tier = await prisma.ennichiTierReached.findUniqueOrThrow({ where: { edition_tier: { edition, tier: 0 } }, select: { served: true, finishedAt: true } });
    expect(tier.served).toBe(grants.filter((g) => !(g.granted as Record<string, unknown>).skipped).length);
    expect(tier.finishedAt).not.toBeNull();
    // Déjà servi : un nouvel appel ne verse rien
    expect(await grantTierWith(prisma, { ...input, tier: 0, userId: users.papa }, deps())).toBe("ALREADY");
    // Palier avec bon « Mythique au choix » : versé à papa par son rattrapage, une fois
    expect(await grantTierWith(prisma, { ...input, tier: 1, userId: users.papa }, deps())).toBe("ALREADY");
    expect(await prisma.voucher.count({ where: { userId: users.papa, kind: "MYTHIC_CHOICE" } })).toBe(1);
    expect(await grantTierWith(prisma, { ...input, tier: 1, userId: users.solo }, deps())).toBe("GRANTED");
    // Suivi de l'envoi dans l'admin : plus personne à servir pour le palier 0 (chaque éligible y a sa ligne) ; pour le
    // palier 1, tous ces éligibles sauf ceux déjà servis
    expect(await pendingCountWith(prisma, { edition, tier: 0, schedule: schedule() })).toBe(0);
    const tier1 = await prisma.ennichiTierGrant.count({ where: { edition, tier: 1 } });
    expect(await pendingCountWith(prisma, { edition, tier: 1, schedule: schedule() })).toBe(grants.length - tier1);
  });

  it("tirage lancé deux fois en même temps : un seul résultat ; banzuke sans bloqués ni révoqués ; prix versés une fois", async () => {
    const outcomes = await Promise.all([0, 1].map(() => drawEnnichiWith(prisma, { staffId: null, rules, now }).then(() => "OK", (e) => (e instanceof EnnichiCloseError ? e.code : String(e)))));
    expect(outcomes.sort()).toEqual(["ALREADY_DRAWN", "OK"]);

    // papa 3 (le bloqué ne compte pas), mama 2 (le révoqué non plus), solo 1
    const results = await prisma.ennichiResult.findMany({ where: { edition }, orderBy: { rank: "asc" }, select: { userId: true, count: true, title: true } });
    expect(results).toEqual([
      { userId: users.papa, count: 3, title: "yokozuna" },
      { userId: users.mama, count: 2, title: "ozeki" },
      { userId: users.solo, count: 1, title: null },
    ]);
    // 6 tickets pour 13 lots : la 1/1, les 2 Divins, puis 3 Mythiques ; un lot par ticket au plus
    const omikuji = await prisma.ennichiAward.findMany({ where: { edition, kind: "OMIKUJI" }, orderBy: { ref: "asc" }, select: { prize: true, userId: true } });
    expect(omikuji).toHaveLength(6);
    expect(omikuji.map((a) => (a.prize as Record<string, unknown>).line)).toEqual([0, 1, 1, 2, 2, 2]);
    expect(await prisma.cosmetic.count({ where: { slug: { startsWith: `ennichi-${edition}-` } } })).toBe(2);

    // Le tirage se refait à l'identique avec la graine révélée
    const draw = await prisma.ennichiDraw.findUniqueOrThrow({ where: { edition } });
    const tickets = draw.tickets as string[];
    const proof = {
      seed: draw.seed,
      seedHash: draw.seedHash,
      tickets,
      ticketsHash: draw.ticketsHash!,
      prizeCount: (draw.prizes as unknown[]).length,
      draws: omikuji.map((a, i) => ({ n: i + 1, prize: i, ticket: ((a.prize as Record<string, unknown>).ticket as number) - 1 })),
    };
    expect(await verifyOmikuji(proof)).toMatchObject({ commitOk: true, ticketsOk: true, drawsOk: true });

    const before = await coins("papa");
    const [a, b] = await Promise.all([payAwardsWith(prisma, edition, deps()), payAwardsWith(prisma, edition, deps())]);
    expect(a.paid + b.paid).toBe(3 + 6);
    // Yokozuna : 1 000 Zeni, un bon « Mythique au choix » et le bon de la carte 1/1 ; plus ses lots de l'omikuji
    const papaOmikuji = omikuji.filter((x) => x.userId === users.papa).map((x) => (x.prize as Record<string, unknown>).line);
    const omikujiZeni = papaOmikuji.reduce<number>((s, line) => s + (line === 1 ? 7 : line === 2 ? 3 : 0), 0);
    expect((await coins("papa")) - before).toBe(1000 + omikujiZeni);
    expect(await prisma.voucher.count({ where: { userId: users.papa, kind: "ONE_OF_ONE" } })).toBe(1 + papaOmikuji.filter((l) => l === 0).length);
    // Rien ne se verse deux fois
    expect((await payAwardsWith(prisma, edition, deps())).paid).toBe(0);
  });
});
