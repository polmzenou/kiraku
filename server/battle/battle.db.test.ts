import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { botAction } from "@/lib/battle/bot";
import { DEFAULT_BATTLE_RULES, type BattleRules } from "@/lib/battle/config";
import { DEFAULT_RANKED_RULES } from "@/lib/ranked/defaults";
import type { Action, BattleSetup, BattleState } from "@/lib/battle/types";
import { seededRng } from "@/lib/rng";
import { createAuctionWith } from "../market/auction-core";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import {
  BattleError,
  cancelRoomWith,
  claimTimeoutWith,
  createRoomWith,
  joinQueueWith,
  joinRoomWith,
  leaveQueueWith,
  playActionWith,
  pollQueueWith,
  startBotBattleWith,
  sweepStaleWith,
  type ClientAction,
  type Ctx,
} from "./battle-core";

// Combat sous concurrence, sur une vraie base (branche Neon de dev) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/battle/battle.db.test.ts
//
// Vérifié partout : les cartes engagées reviennent en collection quelle que soit la fin, une action
// ne passe qu'une fois par version, une récompense n'est versée qu'une fois, solde = Σ journal.

const url = process.env.DATABASE_URL_TEST;
const HOUR = 3_600_000;

/** Coup du moteur → intention envoyée par le client (sans le camp, que le serveur déduit). */
function intent(a: Action): ClientAction {
  if (a.type === "ATTACK") return { type: "ATTACK", actor: a.actor, target: a.target };
  if (a.type === "TECHNIQUE") return a.target === undefined ? { type: "TECHNIQUE", actor: a.actor } : { type: "TECHNIQUE", actor: a.actor, target: a.target };
  return { type: a.type === "FORFEIT" ? "FORFEIT" : "END_TURN" };
}

function codeOf(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "OK";
  return r.reason instanceof BattleError ? r.reason.code : `UNEXPECTED: ${String(r.reason)}`;
}

describe.skipIf(!url)("combat atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  const users: string[] = [];
  let cardIds: string[] = [];
  let seed = 1;

  function ctx(over: Partial<BattleRules> = {}, now = new Date()): Ctx {
    return {
      now,
      rules: { ...DEFAULT_BATTLE_RULES, ...over },
      random: seededRng(seed++),
      dayStart: new Date(now.getTime() - 12 * HOUR),
      ranked: DEFAULT_RANKED_RULES,
      timeZone: "Europe/Paris",
    };
  }

  /** Joueur inscrit avec un exemplaire de chacune des cartes de test. */
  async function player() {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins: 0, createdAt: new Date(Date.now() - 72 * HOUR) },
      select: { id: true },
    });
    await prisma.userCard.createMany({ data: cardIds.map((cardId) => ({ ownerId: user.id, cardId })) });
    users.push(user.id);
    return user.id;
  }

  const team = () => cardIds.slice(0, 3);

  async function statuses(userId: string) {
    const rows = await prisma.userCard.findMany({ where: { ownerId: userId }, select: { status: true } });
    return rows.map((r) => r.status);
  }

  async function balanceMatchesLedger(userId: string) {
    const [user, agg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    return user.coins === (agg._sum.amount ?? 0);
  }

  async function battle(id: string) {
    const b = await prisma.battle.findUniqueOrThrow({ where: { id } });
    return { ...b, state: b.state as unknown as BattleState, setup: b.setup as unknown as BattleSetup };
  }

  /** Deux joueurs appariés en exhibition. */
  async function match() {
    const [a, b] = [await player(), await player()];
    expect((await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "EXHIBITION" }, ctx())).state).toBe("WAITING");
    const res = await joinQueueWith(prisma, { userId: b, cardIds: team(), mode: "EXHIBITION" }, ctx());
    if (res.state !== "MATCHED") throw new Error("pas d'appariement");
    return { a, b, battleId: res.battleId };
  }

  /** Joue la partie jusqu'au bout, chaque camp avec l'IA du bot. */
  async function playOut(battleId: string, ids: [string, string]) {
    const rng = seededRng(99);
    for (let i = 0; i < 400; i++) {
      const b = await battle(battleId);
      if (b.status !== "ACTIVE") return b;
      const side = b.state.active;
      const action = intent(botAction(b.setup, b.state, side, rng, 10));
      await playActionWith(prisma, { userId: ids[side], battleId, version: b.version, action }, ctx());
    }
    throw new Error("partie interminable");
  }

  beforeAll(async () => {
    const cards = await prisma.card.findMany({ where: { rank: { not: null } }, orderBy: { rank: "asc" }, take: 4, select: { id: true } });
    if (cards.length < 4) throw new Error("Catalogue vide : lance d'abord l'import");
    cardIds = cards.map((c) => c.id);
  }, 60_000);

  afterAll(async () => {
    const mine = { userId: { in: users } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { OR: [mine, { actorId: { in: users } }] } }),
      prisma.battleQueue.deleteMany({ where: mine }),
      prisma.battle.deleteMany({ where: { OR: [{ p1Id: { in: users } }, { p2Id: { in: users } }] } }),
      prisma.auction.deleteMany({ where: { sellerId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where: mine }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("file : deux joueurs appariés, cartes engagées, file vidée", async () => {
    const { a, b, battleId } = await match();
    const row = await battle(battleId);
    expect(row).toMatchObject({ status: "ACTIVE", mode: "EXHIBITION", p1Id: a, p2Id: b });
    expect(row.p1Team).toHaveLength(3);
    expect(await prisma.battleQueue.count({ where: { userId: { in: [a, b] } } })).toBe(0);
    expect((await statuses(a)).filter((s) => s === "BATTLE")).toHaveLength(3);
    expect((await pollQueueWith(prisma, { userId: a }, ctx())).state).toBe("MATCHED");
  }, 60_000);

  it("quatre arrivées simultanées : deux parties, personne dans deux parties", async () => {
    const ids = [await player(), await player(), await player(), await player()];
    await Promise.allSettled(ids.map((userId) => joinQueueWith(prisma, { userId, cardIds: team(), mode: "EXHIBITION" }, ctx())));
    // Ceux qui attendent encore se retrouvent au sondage suivant
    for (let i = 0; i < 3; i++) await Promise.allSettled(ids.map((userId) => pollQueueWith(prisma, { userId }, ctx())));
    const battles = await prisma.battle.findMany({ where: { status: "ACTIVE", OR: [{ p1Id: { in: ids } }, { p2Id: { in: ids } }] } });
    expect(battles).toHaveLength(2);
    const seen = battles.flatMap((x) => [x.p1Id, x.p2Id]);
    expect(new Set(seen).size).toBe(4);
  }, 120_000);

  it("deux actions sur la même version : une seule passe", async () => {
    const { a, b, battleId } = await match();
    const row = await battle(battleId);
    const userId = row.state.active === 0 ? a : b;
    const results = await Promise.allSettled(
      [0, 1].map(() => playActionWith(prisma, { userId, battleId, version: row.version, action: { type: "ATTACK", actor: 0, target: 0 } }, ctx())),
    );
    expect(results.map(codeOf).sort()).toEqual(["OK", "STALE"]);
    expect(await prisma.battleAction.count({ where: { battleId } })).toBe(1);
  }, 60_000);

  it("refuse le coup d'un joueur hors de son tour ou d'un inconnu", async () => {
    const { a, b, battleId } = await match();
    const row = await battle(battleId);
    const waiting = row.state.active === 0 ? b : a;
    const stranger = await player();
    const attack = { type: "ATTACK" as const, actor: 0, target: 0 };
    await expect(playActionWith(prisma, { userId: waiting, battleId, version: row.version, action: attack }, ctx())).rejects.toMatchObject({ code: "ILLEGAL" });
    await expect(playActionWith(prisma, { userId: stranger, battleId, version: row.version, action: attack }, ctx())).rejects.toMatchObject({ code: "NOT_PARTICIPANT" });
  }, 60_000);

  it("une carte engagée en file ne peut pas être mise en vente en même temps", async () => {
    const solo = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, createdAt: new Date(Date.now() - 72 * HOUR) },
      select: { id: true },
    });
    users.push(solo.id);
    await prisma.userCard.createMany({ data: team().map((cardId) => ({ ownerId: solo.id, cardId })) });
    const marketRules = {
      enabled: true,
      feeBp: 500,
      minIncrementBp: 500,
      antiSnipeSeconds: 0,
      extendSeconds: 0,
      durationsHours: [24],
      maxActivePerSeller: 10,
      minAccountAgeHours: 0,
      minStartPrice: 1,
      maxPrice: SETTING_DEFAULTS["market.maxPrice"],
    };
    const results = await Promise.allSettled([
      joinQueueWith(prisma, { userId: solo.id, cardIds: team(), mode: "EXHIBITION" }, ctx()),
      createAuctionWith(prisma, { sellerId: solo.id, cardId: team()[0], startPrice: 10, buyoutPrice: null, durationHours: 24, now: new Date(), rules: marketRules }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const st = await statuses(solo.id);
    expect(st.filter((s) => s !== "COLLECTION").length).toBe(results[0].status === "fulfilled" ? 3 : 1);
    await leaveQueueWith(prisma, { userId: solo.id });
  }, 60_000);

  it("partie jouée jusqu'au bout : cartes rendues, gain versé une fois, journal juste", async () => {
    const { a, b, battleId } = await match();
    const end = await playOut(battleId, [a, b]);
    expect(end.status).toBe("FINISHED");
    for (const id of [a, b]) {
      expect(await statuses(id)).toEqual(["COLLECTION", "COLLECTION", "COLLECTION", "COLLECTION"]);
      expect(await balanceMatchesLedger(id)).toBe(true);
    }
    const winnerId = end.winnerSide === 0 ? a : end.winnerSide === 1 ? b : null;
    const rewards = await prisma.coinTransaction.findMany({ where: { refId: battleId, reason: "BATTLE_WIN" } });
    expect(rewards).toHaveLength(winnerId && end.rewardZeni > 0 ? 1 : 0);
    if (winnerId) expect(end.rewardZeni).toBe(DEFAULT_BATTLE_RULES.rewards.exhibition);
    await expect(playActionWith(prisma, { userId: a, battleId, version: end.version, action: { type: "FORFEIT" } }, ctx())).rejects.toMatchObject({ code: "CLOSED" });
  }, 180_000);

  it("abandons simultanés des deux joueurs : une seule fin, une seule libération", async () => {
    const { a, b, battleId } = await match();
    const row = await battle(battleId);
    const results = await Promise.allSettled(
      [a, b].map((userId) => playActionWith(prisma, { userId, battleId, version: row.version, action: { type: "FORFEIT" } }, ctx())),
    );
    // Le second voit la partie déjà finie
    expect(results.map(codeOf).sort()).toEqual(["CLOSED", "OK"]);
    const end = await battle(battleId);
    expect(end).toMatchObject({ status: "FINISHED", endReason: "FORFEIT", rewardZeni: 0 }); // abandon au 1er tour : pas de gain
    for (const id of [a, b]) expect((await statuses(id)).every((s) => s === "COLLECTION")).toBe(true);
  }, 60_000);

  it("plafond quotidien : au-delà de dailyCap victoires, plus de gain", async () => {
    const [a, b] = [await player(), await player()];
    const rewarded: number[] = [];
    for (let i = 0; i < 2; i++) {
      await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "EXHIBITION" }, ctx());
      const res = await joinQueueWith(prisma, { userId: b, cardIds: team(), mode: "EXHIBITION" }, ctx());
      if (res.state !== "MATCHED") throw new Error("pas d'appariement");
      // Deux fins de tour puis abandon de b : a gagne au 3e tour (gain possible)
      for (let t = 0; t < 2; t++) {
        const row = await battle(res.battleId);
        await playActionWith(prisma, { userId: row.state.active === 0 ? a : b, battleId: res.battleId, version: row.version, action: { type: "END_TURN" } }, ctx({ rewards: { ...DEFAULT_BATTLE_RULES.rewards, dailyCap: 1 } }));
      }
      const row = await battle(res.battleId);
      const u = await playActionWith(prisma, { userId: b, battleId: res.battleId, version: row.version, action: { type: "FORFEIT" } }, ctx({ rewards: { ...DEFAULT_BATTLE_RULES.rewards, dailyCap: 1 } }));
      rewarded.push(u.rewardZeni);
    }
    expect(rewarded).toEqual([DEFAULT_BATTLE_RULES.rewards.exhibition, 0]);
    expect(await balanceMatchesLedger(a)).toBe(true);
  }, 120_000);

  it("minuteur : rien avant l'échéance ; une partie oubliée se termine au balayage, cartes rendues", async () => {
    const { a, b, battleId } = await match();
    await expect(claimTimeoutWith(prisma, { userId: a, battleId }, ctx())).rejects.toMatchObject({ code: "TOO_EARLY" });
    const later = new Date(Date.now() + 10 * 60_000);
    const res = await sweepStaleWith(prisma, ctx({}, later), { userId: a });
    expect(res.expired.map((u) => u.battleId)).toContain(battleId);
    expect(await battle(battleId)).toMatchObject({ status: "FINISHED", endReason: "TIMEOUT" });
    for (const id of [a, b]) expect((await statuses(id)).every((s) => s === "COLLECTION")).toBe(true);
  }, 60_000);

  it("file quittée ou abandonnée : place libérée, cartes rendues", async () => {
    const a = await player();
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "EXHIBITION" }, ctx());
    expect((await leaveQueueWith(prisma, { userId: a })).state).toBe("NONE");
    expect((await statuses(a)).every((s) => s === "COLLECTION")).toBe(true);

    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "EXHIBITION" }, ctx());
    const res = await sweepStaleWith(prisma, ctx({}, new Date(Date.now() + 5 * 60_000)), { userId: a });
    expect(res.queueCleared).toBe(1);
    expect((await statuses(a)).every((s) => s === "COLLECTION")).toBe(true);
  }, 60_000);

  it("bot : seulement après queueSeconds, puis partie jouable jusqu'au bout", async () => {
    const a = await player();
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "EXHIBITION" }, ctx());
    await expect(startBotBattleWith(prisma, { userId: a }, ctx())).rejects.toMatchObject({ code: "TOO_EARLY" });
    const u = await startBotBattleWith(prisma, { userId: a }, ctx({}, new Date(Date.now() + 60_000)));
    const row = await battle(u.battleId);
    expect(row).toMatchObject({ p2Id: null, status: "ACTIVE" });
    expect(row.botName).toBeTruthy();
    expect(row.setup.teams[1]).toHaveLength(3);
    expect(row.state.active).toBe(0); // le bot a déjà joué s'il commençait
    const rng = seededRng(5);
    for (let i = 0; i < 200; i++) {
      const b = await battle(u.battleId);
      if (b.status !== "ACTIVE") break;
      const action = intent(botAction(b.setup, b.state, 0, rng, 10));
      await playActionWith(prisma, { userId: a, battleId: u.battleId, version: b.version, action }, ctx());
    }
    const end = await battle(u.battleId);
    expect(end.status).toBe("FINISHED");
    expect((await statuses(a)).every((s) => s === "COLLECTION")).toBe(true);
    if (end.winnerSide === 0 && end.state.turn >= 3) expect(end.rewardZeni).toBe(DEFAULT_BATTLE_RULES.rewards.bot);
  }, 180_000);

  it("salle d'amis : code, une seule entrée, propriétaire et intrus refusés, fermeture et expiration", async () => {
    const [host, guest, intruder] = [await player(), await player(), await player()];
    const room = await createRoomWith(prisma, { userId: host, cardIds: team(), inviteeId: null }, ctx());
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    await expect(joinRoomWith(prisma, { userId: host, cardIds: team(), code: room.code }, ctx())).rejects.toMatchObject({ code: "OWN_ROOM" });
    const results = await Promise.allSettled(
      [guest, intruder].map((userId) => joinRoomWith(prisma, { userId, cardIds: team(), code: room.code }, ctx())),
    );
    expect(results.map(codeOf).sort()).toEqual(["NOT_FOUND", "OK"]); // le code disparaît au lancement
    expect(await battle(room.battleId)).toMatchObject({ status: "ACTIVE", code: null });
    const loser = results[0].status === "fulfilled" ? intruder : guest;
    expect((await statuses(loser)).every((s) => s === "COLLECTION")).toBe(true);

    const [h2, h3] = [await player(), await player()];
    const r2 = await createRoomWith(prisma, { userId: h2, cardIds: team(), inviteeId: null }, ctx());
    await cancelRoomWith(prisma, { userId: h2, battleId: r2.battleId }, ctx());
    expect((await statuses(h2)).every((s) => s === "COLLECTION")).toBe(true);
    const r3 = await createRoomWith(prisma, { userId: h3, cardIds: team(), inviteeId: null }, ctx());
    const res = await sweepStaleWith(prisma, ctx({}, new Date(Date.now() + 2 * HOUR)), { userId: h3 });
    expect(res.roomsClosed).toBe(1);
    expect(await battle(r3.battleId)).toMatchObject({ status: "CANCELLED" });
    expect((await statuses(h3)).every((s) => s === "COLLECTION")).toBe(true);
  }, 120_000);

  it("une seule activité à la fois : pas de file pendant une salle ouverte", async () => {
    const a = await player();
    await createRoomWith(prisma, { userId: a, cardIds: team(), inviteeId: null }, ctx());
    await expect(joinQueueWith(prisma, { userId: a, cardIds: cardIds.slice(1, 4), mode: "EXHIBITION" }, ctx())).rejects.toMatchObject({ code: "IN_BATTLE" });
  }, 60_000);
});
