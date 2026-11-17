import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyFlip } from "@/lib/casino/fairness";
import { DEFAULT_CASINO_RULES, type CasinoRules } from "@/lib/casino/rules";
import { pairKey } from "@/lib/social/relation";
import type { MarketRules } from "@/lib/market/rules";
import { createPgAdapter } from "@/server/pg-adapter";
import { recycleWith, RecycleError } from "../collection/recycle-core";
import { createAuctionWith } from "../market/auction-core";
import { freeCopy } from "../social/free-copy";
import {
  adminCancelTableWith,
  cancelTableWith,
  CoinFlipError,
  createTableWith,
  declineTableWith,
  joinTableWith,
  markSeenWith,
  sweepCasinoWith,
  withdrawCasinoWith,
  type CoinFlipContext,
} from "./coinflip-core";

// Pile ou face sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/casino/coinflip.db.test.ts
// Joueurs et cartes jetables supprimés à la fin (tables, exemplaires et notifications partent en cascade).

const url = process.env.DATABASE_URL_TEST;
const OLD = new Date(Date.now() - 30 * 86_400_000);
const HOUR = 3_600_000;
const MARKET: MarketRules = {
  enabled: true,
  feeBp: 500,
  minIncrementBp: 500,
  antiSnipeSeconds: 120,
  extendSeconds: 120,
  durationsHours: [1, 6, 24, 48],
  maxActivePerSeller: 10,
  minAccountAgeHours: 48,
  minStartPrice: 1,
  maxPrice: 10_000_000,
  maxPriceByRarity: {},
};

describe.skipIf(!url)("pile ou face atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const users: string[] = [];
  const createdCards: string[] = [];
  let definitions: { key: string; sortOrder: number }[] = [];
  const card: Record<"MYTHIC" | "BR" | "AR" | "EPIC" | "EPIC2", string> = { MYTHIC: "", BR: "", AR: "", EPIC: "", EPIC2: "" };

  const rules = (over: Partial<CasinoRules["coinflip"]> = {}): CasinoRules => ({
    ...DEFAULT_CASINO_RULES,
    opensAt: OLD.getTime(),
    coinflip: { ...DEFAULT_CASINO_RULES.coinflip, ...over },
  });
  const ctx = (over: Partial<CoinFlipContext> = {}): CoinFlipContext => ({
    now: new Date(),
    rules: rules(),
    dayStart: new Date(Date.now() - HOUR),
    definitions,
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    ...over,
  });

  async function player(over: { createdAt?: Date; isGuest?: boolean } = {}) {
    const user = await prisma.user.create({
      data: { username: `cf-${randomBytes(4).toString("hex")}`, isGuest: over.isGuest ?? false, coins: 0, createdAt: over.createdAt ?? OLD },
    });
    users.push(user.id);
    return user.id;
  }
  const give = async (ownerId: string, cardId: string, n = 1) => {
    for (let i = 0; i < n; i++) await prisma.userCard.create({ data: { ownerId, cardId } });
  };
  const owned = (ownerId: string, cardId: string) => prisma.userCard.count({ where: { ownerId, cardId } });
  const inStatus = (ownerId: string, status: "COLLECTION" | "CASINO") => prisma.userCard.count({ where: { ownerId, status } });
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof CoinFlipError ? e.code : String(e);
    }
  };

  beforeAll(async () => {
    definitions = await prisma.rarityDefinition.findMany({ select: { key: true, sortOrder: true } });
    const series = await prisma.series.findFirst({ select: { id: true } });
    if (!series) throw new Error("Catalogue vide : lance d'abord npm run catalog:import");
    for (const [name, rarity] of [["MYTHIC", "MYTHIC"], ["BR", "BR"], ["AR", "AR"], ["EPIC", "EPIC"], ["EPIC2", "EPIC"]] as const) {
      const row = await prisma.card.create({
        data: {
          name: `cf-${name}-${randomBytes(3).toString("hex")}`,
          imageUrl: "https://example.test/cf.png",
          favorites: 0,
          rarity,
          power: 50,
          ki: 50,
          seriesId: series.id,
          searchText: "cf",
          origin: "CUSTOM",
        },
        select: { id: true },
      });
      card[name] = row.id;
      createdCards.push(row.id);
    }
  }, 30_000);

  afterAll(async () => {
    if (users.length > 0) await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (createdCards.length > 0) await prisma.card.deleteMany({ where: { id: { in: createdCards } } });
    await prisma.$disconnect();
  }, 30_000);

  it("pose, relève et donne les deux cartes au gagnant ; le tirage se vérifie", async () => {
    const [a, b] = [await player(), await player()];
    await give(a, card.MYTHIC, 2);
    await give(b, card.BR, 2);

    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.MYTHIC, side: "OMOTE" }, ctx());
    expect(await inStatus(a, "CASINO")).toBe(1);
    const open = await prisma.coinFlip.findUniqueOrThrow({ where: { id: flipId } });
    expect(open).toMatchObject({ status: "OPEN", tierOrder: 500, creatorRarity: "MYTHIC" });

    const res = await joinTableWith(prisma, { userId: b, flipId, cardId: card.BR }, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const done = await prisma.coinFlip.findUniqueOrThrow({ where: { id: flipId } });
    expect(done).toMatchObject({ status: "DONE", opponentId: b, result: res.result });
    const winner = done.winnerId!;
    expect(winner).toBe(res.won ? b : a);
    const loser = winner === a ? b : a;
    // Le gagnant a ses deux mises (2 + 1), le perdant n'a plus que son autre exemplaire
    expect((await owned(winner, card.MYTHIC)) + (await owned(winner, card.BR))).toBe(3);
    expect((await owned(loser, card.MYTHIC)) + (await owned(loser, card.BR))).toBe(1);
    expect(await inStatus(a, "CASINO")).toBe(0);
    expect(res.prize.isNew).toBe(true);
    expect(done.winnerNew).toBe(true);

    const v = await verifyFlip({ tableId: flipId, seed: done.seed, seedHash: done.seedHash, result: done.result! });
    expect(v).toMatchObject({ commitOk: true, outcomeOk: true });
    // Le créateur est prévenu sans l'issue
    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: a, type: "COINFLIP_RESOLVED", refId: flipId } });
    expect(JSON.stringify(notif.payload)).not.toMatch(/OMOTE|URA|won|winner/);
    expect(await markSeenWith(prisma, { userId: a, flipIds: [flipId], now: new Date() })).toBe(1);
    expect(await markSeenWith(prisma, { userId: a, flipIds: [flipId], now: new Date() })).toBe(0);
  }, 60_000);

  it("paliers : une BR relève une Mythique, une AR ou une Épique non", async () => {
    const [a, b] = [await player(), await player()];
    await give(a, card.MYTHIC, 2);
    await give(b, card.AR, 2);
    await give(b, card.EPIC, 2);
    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.MYTHIC, side: "URA" }, ctx());
    expect(await code(joinTableWith(prisma, { userId: b, flipId, cardId: card.AR }, ctx()))).toBe("TIER");
    expect(await code(joinTableWith(prisma, { userId: b, flipId, cardId: card.EPIC }, ctx()))).toBe("TIER");
    expect(await prisma.coinFlip.count({ where: { id: flipId, status: "OPEN" } })).toBe(1);
  }, 60_000);

  it("vingt relèves simultanées : une seule réussit, aucune carte dupliquée", async () => {
    const a = await player();
    await give(a, card.EPIC, 2);
    const joiners = await Promise.all(Array.from({ length: 20 }, () => player()));
    for (const j of joiners) await give(j, card.EPIC2, 2);
    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());

    const results = await Promise.allSettled(joiners.map((j) => joinTableWith(prisma, { userId: j, flipId, cardId: card.EPIC2 }, ctx())));
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason?.code === "NOT_OPEN")).toBe(true);
    const total = await prisma.userCard.count({ where: { ownerId: { in: [a, ...joiners] }, cardId: { in: [card.EPIC, card.EPIC2] } } });
    expect(total).toBe(2 + 20 * 2);
    expect(await prisma.userCard.count({ where: { ownerId: { in: [a, ...joiners] }, status: "CASINO" } })).toBe(0);
  }, 120_000);

  it("relève contre retrait : l'un ou l'autre, jamais les deux", async () => {
    for (let round = 0; round < 5; round++) {
      const [a, b] = [await player(), await player()];
      await give(a, card.EPIC, 2);
      await give(b, card.EPIC2, 2);
      const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
      const [join, cancel] = await Promise.allSettled([
        joinTableWith(prisma, { userId: b, flipId, cardId: card.EPIC2 }, ctx()),
        cancelTableWith(prisma, { userId: a, flipId }, ctx()),
      ]);
      const joined = join.status === "fulfilled" && join.value.ok;
      expect(joined !== (cancel.status === "fulfilled")).toBe(true);
      const row = await prisma.coinFlip.findUniqueOrThrow({ where: { id: flipId } });
      expect(row.status).toBe(joined ? "DONE" : "CANCELLED");
      expect(await inStatus(a, "CASINO")).toBe(0);
      expect((await owned(a, card.EPIC)) + (await owned(b, card.EPIC))).toBe(2);
    }
  }, 120_000);

  it("le même dernier exemplaire posé deux fois en même temps : une seule table", async () => {
    const a = await player();
    await give(a, card.EPIC, 1);
    const results = await Promise.allSettled([
      createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE", confirmLastCopy: true }, ctx()),
      createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "URA", confirmLastCopy: true }, ctx()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.coinFlip.count({ where: { creatorId: a, status: "OPEN" } })).toBe(1);
  }, 60_000);

  it("dernier exemplaire : confirmation exigée, interdit si le réglage le coupe", async () => {
    const a = await player();
    await give(a, card.EPIC, 1);
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx()))).toBe("CONFIRM_LAST_COPY");
    const noLast = ctx({ rules: rules({ lastCopyAllowed: false }) });
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE", confirmLastCopy: true }, noLast))).toBe("LAST_COPY");
    // Deux exemplaires : le second posé alors que le premier est déjà en jeu redevient un « dernier »
    await give(a, card.EPIC, 1);
    await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx()))).toBe("CONFIRM_LAST_COPY");
  }, 60_000);

  it("quota du jour sous charge : jamais plus que la limite", async () => {
    const a = await player();
    await give(a, card.EPIC, 10);
    const limited = ctx({ rules: rules({ dailyLimit: 3, maxOpenTables: 20 }) });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, limited)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason?.code === "DAILY_LIMIT")).toBe(true);
    // Une relève compte aussi : le joueur au plafond ne relève plus
    const b = await player();
    await give(b, card.EPIC2, 2);
    const { flipId } = await createTableWith(prisma, { userId: b, cardId: card.EPIC2, side: "OMOTE" }, limited);
    expect(await code(joinTableWith(prisma, { userId: a, flipId, cardId: card.EPIC }, limited))).toBe("DAILY_LIMIT");
  }, 60_000);

  it("trois tables ouvertes au plus", async () => {
    const a = await player();
    await give(a, card.EPIC, 6);
    for (let i = 0; i < 3; i++) await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx()))).toBe("TABLE_LIMIT");
  }, 60_000);

  it("garde-fous : invité, compte récent, contre soi-même, joueur bloqué, casino fermé", async () => {
    const [a, guest, fresh, blocker] = [await player(), await player({ isGuest: true }), await player({ createdAt: new Date() }), await player()];
    await give(a, card.EPIC, 3);
    for (const u of [guest, fresh, blocker]) await give(u, card.EPIC2, 2);
    expect(await code(createTableWith(prisma, { userId: guest, cardId: card.EPIC2, side: "OMOTE" }, ctx()))).toBe("GUEST");
    expect(await code(createTableWith(prisma, { userId: fresh, cardId: card.EPIC2, side: "OMOTE" }, ctx()))).toBe("TOO_NEW");
    const closed = ctx({ rules: { ...rules(), opensAt: Date.now() + HOUR } });
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, closed))).toBe("CLOSED");

    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    expect(await code(joinTableWith(prisma, { userId: a, flipId, cardId: card.EPIC }, ctx()))).toBe("OWN_TABLE");
    await prisma.userBlock.create({ data: { blockerId: blocker, blockedId: a } });
    expect(await code(joinTableWith(prisma, { userId: blocker, flipId, cardId: card.EPIC2 }, ctx()))).toBe("BLOCKED");
    expect(await code(joinTableWith(prisma, { userId: guest, flipId, cardId: card.EPIC2 }, ctx()))).toBe("GUEST");
  }, 60_000);

  it("réservation : ami ou ancien adversaire seulement ; l'invité relève ou décline, les autres non", async () => {
    const [a, friend, stranger] = [await player(), await player(), await player()];
    await give(a, card.EPIC, 4);
    await give(friend, card.EPIC2, 2);
    await give(stranger, card.EPIC2, 2);
    expect(await code(createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE", reservedForId: stranger }, ctx()))).toBe("RESERVE_TARGET");
    await prisma.friendship.create({ data: { pairKey: pairKey(a, friend), requesterId: a, addresseeId: friend, status: "ACCEPTED", createdAt: OLD, acceptedAt: OLD } });

    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE", reservedForId: friend }, ctx());
    expect(await prisma.notification.count({ where: { userId: friend, type: "COINFLIP_INVITE", refId: flipId } })).toBe(1);
    expect(await code(joinTableWith(prisma, { userId: stranger, flipId, cardId: card.EPIC2 }, ctx()))).toBe("RESERVED");
    expect(await code(declineTableWith(prisma, { userId: stranger, flipId }, ctx()))).toBe("NOT_FOUND");

    await declineTableWith(prisma, { userId: friend, flipId }, ctx());
    expect(await prisma.coinFlip.findUniqueOrThrow({ where: { id: flipId }, select: { status: true } })).toEqual({ status: "CANCELLED" });
    expect(await inStatus(a, "CASINO")).toBe(0);
    expect(await prisma.notification.count({ where: { refId: flipId, type: "COINFLIP_INVITE" } })).toBe(0);
    const back = await prisma.notification.findFirstOrThrow({ where: { userId: a, type: "COINFLIP_RETURNED", refId: flipId } });
    expect(back.payload).toMatchObject({ reason: "DECLINED" });

    // Revanche : après un lancer joué, l'ancien adversaire devient réservable
    const open = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    await joinTableWith(prisma, { userId: stranger, flipId: open.flipId, cardId: card.EPIC2 }, ctx());
    const winner = (await prisma.coinFlip.findUniqueOrThrow({ where: { id: open.flipId } })).winnerId;
    const rematchFrom = winner === a ? a : stranger;
    const rematchFor = winner === a ? stranger : a;
    const stake = rematchFrom === a ? card.EPIC : card.EPIC2;
    await prisma.userCard.create({ data: { ownerId: rematchFrom, cardId: stake } });
    const rematch = await createTableWith(prisma, { userId: rematchFrom, cardId: stake, side: "URA", reservedForId: rematchFor }, ctx());
    expect(rematch.flipId).toBeTruthy();
  }, 60_000);

  it("expiration : le balayage rend la carte une seule fois, même lancé deux fois en même temps", async () => {
    const a = await player();
    await give(a, card.EPIC, 4);
    const past = ctx({ now: new Date(Date.now() - 48 * HOUR), dayStart: new Date(Date.now() - 49 * HOUR) });
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, past)).flipId);
    const [s1, s2] = await Promise.all([sweepCasinoWith(prisma, ctx(), { creatorId: a }), sweepCasinoWith(prisma, ctx(), { creatorId: a })]);
    expect(s1 + s2).toBe(3);
    expect(await prisma.coinFlip.count({ where: { id: { in: ids }, status: "EXPIRED" } })).toBe(3);
    expect(await inStatus(a, "CASINO")).toBe(0);
    expect(await prisma.notification.count({ where: { userId: a, type: "COINFLIP_RETURNED", refId: { in: ids } } })).toBe(3);
    expect(await sweepCasinoWith(prisma, ctx(), { creatorId: a })).toBe(0);
  }, 60_000);

  it("une table expirée trouvée à la relève se ferme et rend la carte", async () => {
    const [a, b] = [await player(), await player()];
    await give(a, card.EPIC, 2);
    await give(b, card.EPIC2, 2);
    const past = ctx({ now: new Date(Date.now() - 48 * HOUR), dayStart: new Date(Date.now() - 49 * HOUR) });
    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, past);
    expect(await joinTableWith(prisma, { userId: b, flipId, cardId: card.EPIC2 }, ctx())).toEqual({ ok: false, code: "NOT_OPEN" });
    expect((await prisma.coinFlip.findUniqueOrThrow({ where: { id: flipId } })).status).toBe("EXPIRED");
    expect(await inStatus(a, "CASINO")).toBe(0);
  }, 60_000);

  it("retrait par l'admin : carte rendue, créateur prévenu, journal", async () => {
    const [a, admin] = [await player(), await player()];
    await give(a, card.EPIC, 2);
    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    await adminCancelTableWith(prisma, { adminId: admin, flipId, reason: "test" }, ctx());
    expect(await inStatus(a, "CASINO")).toBe(0);
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: a, type: "COINFLIP_RETURNED", refId: flipId } })).payload).toMatchObject({ reason: "ADMIN" });
    expect(await prisma.adminLog.count({ where: { adminId: admin, action: "COINFLIP_CANCEL", targetId: flipId } })).toBe(1);
    await prisma.adminLog.deleteMany({ where: { adminId: admin } });
  }, 60_000);

  it("retrait du casino d'un joueur : ses tables et celles qui lui sont réservées se ferment", async () => {
    const [a, b] = [await player(), await player()];
    await give(a, card.EPIC, 4);
    await give(b, card.EPIC2, 2);
    await prisma.friendship.create({ data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", createdAt: OLD, acceptedAt: OLD } });
    await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE" }, ctx());
    await createTableWith(prisma, { userId: b, cardId: card.EPIC2, side: "OMOTE", reservedForId: a }, ctx());
    await prisma.$transaction((tx) => withdrawCasinoWith(tx, a, new Date()));
    expect(await prisma.coinFlip.count({ where: { OR: [{ creatorId: a }, { reservedForId: a }], status: "OPEN" } })).toBe(0);
    expect(await inStatus(a, "CASINO")).toBe(0);
    expect(await inStatus(b, "CASINO")).toBe(0);
  }, 60_000);

  it("une carte misée échappe au recyclage, à la vente et aux échanges", async () => {
    const a = await player();
    await give(a, card.EPIC, 1);
    const { flipId } = await createTableWith(prisma, { userId: a, cardId: card.EPIC, side: "OMOTE", confirmLastCopy: true }, ctx());
    await prisma.userCard.create({ data: { ownerId: a, cardId: card.EPIC2 } });
    await prisma.userCard.create({ data: { ownerId: a, cardId: card.EPIC2 } });
    // Recyclage : seul le doublon libre d'EPIC2 part, jamais la carte en jeu
    await expect(
      recycleWith(prisma, a, { kind: "card", cardId: card.EPIC, count: 1 }, { COMMON: 1, UNCOMMON: 1, RARE: 1, EPIC: 10, LEGENDARY: 1, MYTHIC: 1 }),
    ).rejects.toBeInstanceOf(RecycleError);
    // Vente et échanges : aucun exemplaire libre
    await expect(
      createAuctionWith(prisma, { sellerId: a, cardId: card.EPIC, startPrice: 10, buyoutPrice: null, durationHours: 24, now: new Date(), rules: MARKET }),
    ).rejects.toThrow();
    expect(await prisma.$transaction((tx) => freeCopy(tx, a, card.EPIC))).toBeNull();
    // Toujours en jeu après ces tentatives
    expect(await prisma.coinFlip.count({ where: { id: flipId, status: "OPEN" } })).toBe(1);
    expect(await inStatus(a, "CASINO")).toBe(1);
  }, 60_000);

  it("conservation des cartes sur une suite aléatoire de poses, relèves, retraits et expirations", async () => {
    const players = await Promise.all(Array.from({ length: 6 }, () => player()));
    for (const p of players) {
      await give(p, card.EPIC, 3);
      await give(p, card.EPIC2, 3);
    }
    const loose = ctx({ rules: rules({ dailyLimit: 500, maxOpenTables: 20 }) });
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
    const ops = Array.from({ length: 40 }, async () => {
      const who = pick(players);
      const roll = Math.random();
      const open = await prisma.coinFlip.findMany({ where: { creatorId: { in: players }, status: "OPEN" }, select: { id: true, creatorId: true } });
      if (roll < 0.45 || open.length === 0) {
        return createTableWith(prisma, { userId: who, cardId: pick([card.EPIC, card.EPIC2]), side: pick(["OMOTE", "URA"] as const), confirmLastCopy: true }, loose);
      }
      const table = pick(open);
      if (roll < 0.85) return joinTableWith(prisma, { userId: who, flipId: table.id, cardId: pick([card.EPIC, card.EPIC2]), confirmLastCopy: true }, loose);
      return cancelTableWith(prisma, { userId: table.creatorId, flipId: table.id }, loose);
    });
    await Promise.allSettled(ops);
    await sweepCasinoWith(prisma, ctx({ now: new Date(Date.now() + 48 * HOUR) }), { batch: 500 });
    const total = await prisma.userCard.count({ where: { ownerId: { in: players } } });
    expect(total).toBe(6 * 6);
    // Séquestre sain : autant de cartes en jeu que de tables ouvertes (aucune après le balayage)
    const [openTables, staked] = await Promise.all([
      prisma.coinFlip.count({ where: { creatorId: { in: players }, status: "OPEN" } }),
      prisma.userCard.count({ where: { ownerId: { in: players }, status: "CASINO" } }),
    ]);
    expect(staked).toBe(openTables);
    expect(openTables).toBe(0);
  }, 180_000);
});
