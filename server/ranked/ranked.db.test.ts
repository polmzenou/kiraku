import { randomBytes } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import type { BattleState } from "@/lib/battle/types";
import { DEFAULT_RANKED_RULES } from "@/lib/ranked/defaults";
import type { RankedRules } from "@/lib/ranked/rules";
import { seededRng } from "@/lib/rng";
import { joinQueueWith, playActionWith, pollQueueWith, startBotBattleWith, type Ctx } from "../battle/battle-core";
import { claimSeasonRewardWith, currentSeasonWith, rollSeasonWith } from "./ranked-core";

// Classé sur une vraie base (branche Neon de dev) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/ranked/ranked.db.test.ts
//
// Vérifié : PC des deux camps appliqués une seule fois dans la transaction de fin de partie,
// fourchette d'appariement, bot à 50 %, anti-boost, protection, Grand Champion, fin de saison
// idempotente et récompense réclamée une seule fois.
// Attention : le test de fin de saison clôt la saison ouverte de la base de test.

const url = process.env.DATABASE_URL_TEST;
const HOUR = 3_600_000;

describe.skipIf(!url)("classé atomique (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  const users: string[] = [];
  const lots: string[] = [];
  let cardIds: string[] = [];
  let seed = 100;

  function ctx(ranked: Partial<RankedRules> = {}, now = new Date()): Ctx {
    return {
      now,
      rules: DEFAULT_BATTLE_RULES,
      random: seededRng(seed++),
      dayStart: new Date(now.getTime() - 12 * HOUR),
      ranked: { ...DEFAULT_RANKED_RULES, ...ranked },
      timeZone: "Europe/Paris",
    };
  }

  async function player(pc: number, extra: { rankProtection?: number } = {}) {
    const user = await prisma.user.create({
      data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, rankPoints: pc, ...extra, createdAt: new Date(Date.now() - 72 * HOUR) },
      select: { id: true },
    });
    await prisma.userCard.createMany({ data: cardIds.map((cardId) => ({ ownerId: user.id, cardId })) });
    users.push(user.id);
    return user.id;
  }

  const team = () => cardIds.slice(0, 3);
  const pcOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { rankPoints: true } })).rankPoints;
  async function battle(id: string) {
    const b = await prisma.battle.findUniqueOrThrow({ where: { id } });
    return { ...b, state: b.state as unknown as BattleState };
  }

  async function rankedMatch(pcA: number, pcB: number, c = ctx()) {
    const [a, b] = [await player(pcA), await player(pcB)];
    expect((await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "RANKED" }, c)).state).toBe("WAITING");
    const res = await joinQueueWith(prisma, { userId: b, cardIds: team(), mode: "RANKED" }, c);
    if (res.state !== "MATCHED") throw new Error("pas d'appariement");
    return { a, b, battleId: res.battleId };
  }

  /** Deux fins de tour (on atteint le 3e tour) puis abandon de `loser`. */
  async function finishAfterTurns(battleId: string, ids: [string, string], loser: string, turns = 2) {
    for (let i = 0; i < turns; i++) {
      const row = await battle(battleId);
      await playActionWith(prisma, { userId: ids[row.state.active], battleId, version: row.version, action: { type: "END_TURN" } }, ctx());
    }
    const row = await battle(battleId);
    return playActionWith(prisma, { userId: loser, battleId, version: row.version, action: { type: "FORFEIT" } }, ctx());
  }

  beforeAll(async () => {
    const cards = await prisma.card.findMany({ where: { rank: { not: null } }, orderBy: { rank: "asc" }, take: 3, select: { id: true } });
    if (cards.length < 3) throw new Error("Catalogue vide : lance d'abord l'import");
    cardIds = cards.map((c) => c.id);
    await currentSeasonWith(prisma, new Date(), DEFAULT_RANKED_RULES, "Europe/Paris");
  }, 60_000);

  afterAll(async () => {
    const mine = { userId: { in: users } };
    await prisma.$transaction([
      prisma.seasonResult.deleteMany({ where: mine }),
      prisma.battleQueue.deleteMany({ where: mine }),
      prisma.battle.deleteMany({ where: { OR: [{ p1Id: { in: users } }, { p2Id: { in: users } }] } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.coinTransaction.deleteMany({ where: mine }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.lot.deleteMany({ where: { id: { in: lots } } }),
    ]);
    await prisma.$disconnect();
  }, 60_000);

  it("fourchette : 300 PC d'écart refusés tout de suite, acceptés après une minute d'attente", async () => {
    const [a, b] = [await player(600), await player(900)];
    const t0 = new Date();
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "RANKED" }, ctx({}, t0));
    expect((await joinQueueWith(prisma, { userId: b, cardIds: team(), mode: "RANKED" }, ctx({}, t0))).state).toBe("WAITING");
    const later = new Date(t0.getTime() + 10_000);
    await prisma.battleQueue.updateMany({ where: { userId: { in: [a, b] } }, data: { seenAt: later } });
    expect((await pollQueueWith(prisma, { userId: b }, ctx({}, later))).state).toBe("WAITING");
    const muchLater = new Date(t0.getTime() + 40_000); // 150 + 5 × 40 = 350 ≥ 300
    await prisma.battleQueue.updateMany({ where: { userId: { in: [a, b] } }, data: { seenAt: muchLater } });
    expect((await pollQueueWith(prisma, { userId: b }, ctx({}, muchLater))).state).toBe("MATCHED");
  }, 120_000);

  it("fin de partie : le gagnant monte, le perdant descend, une seule fois, rangs figés sur la partie", async () => {
    const { a, b, battleId } = await rankedMatch(600, 650);
    const start = await battle(battleId);
    expect([start.p1Tier, start.p2Tier]).toEqual(["GOLD", "GOLD"]);
    const u = await finishAfterTurns(battleId, [a, b], b);
    // Écrasante (aucune carte perdue). a (600) bat plus fort que lui : 36 × (1 + 12,5 %) = 41.
    // b (650) perd contre plus faible : la défaite coûte plus, 24 × (1 + 12,5 %) = 27.
    expect(u.ranked?.crushing).toBe(true);
    expect([await pcOf(a), await pcOf(b)]).toEqual([641, 623]);
    const end = await battle(battleId);
    expect(end).toMatchObject({ pcBeforeP1: 600, pcDeltaP1: 41, pcBeforeP2: 650, pcDeltaP2: -27, crushing: true });
    expect(end.seasonId).toBeTruthy();
    const games = await prisma.user.findMany({ where: { id: { in: [a, b] } }, select: { seasonGames: true } });
    expect(games.map((g) => g.seasonGames)).toEqual([1, 1]);
  }, 120_000);

  it("deux fins simultanées : les PC ne bougent qu'une fois", async () => {
    const { a, b, battleId } = await rankedMatch(300, 300);
    for (let i = 0; i < 2; i++) {
      const row = await battle(battleId);
      await playActionWith(prisma, { userId: row.state.active === 0 ? a : b, battleId, version: row.version, action: { type: "END_TURN" } }, ctx());
    }
    const row = await battle(battleId);
    const results = await Promise.allSettled(
      [a, b].map((userId) => playActionWith(prisma, { userId, battleId, version: row.version, action: { type: "FORFEIT" } }, ctx())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const total = (await pcOf(a)) + (await pcOf(b));
    const end = await battle(battleId);
    expect(total).toBe(600 + (end.pcDeltaP1 ?? 0) + (end.pcDeltaP2 ?? 0));
  }, 120_000);

  it("anti-boost : abandon au premier tour, le partant perd, le gagnant ne gagne rien", async () => {
    const { a, b, battleId } = await rankedMatch(400, 400);
    const row = await battle(battleId);
    await playActionWith(prisma, { userId: b, battleId, version: row.version, action: { type: "FORFEIT" } }, ctx());
    // Équipe gagnante intacte : défaite écrasante en Argent (−19), et rien pour le gagnant
    expect([await pcOf(a), await pcOf(b)]).toEqual([400, 381]);
  }, 60_000);

  it("contre un bot : moitié des PC, seul le joueur bouge", async () => {
    const a = await player(1000);
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "RANKED" }, ctx());
    const u = await startBotBattleWith(prisma, { userId: a }, ctx({}, new Date(Date.now() + 60_000)));
    const row = await battle(u.battleId);
    expect([row.p1Tier, row.p2Tier]).toEqual(["EMERALD", "EMERALD"]);
    const end = await playActionWith(prisma, { userId: a, battleId: u.battleId, version: row.version, action: { type: "FORFEIT" } }, ctx());
    // Défaite simple en Émeraude (−19), adversaire au même niveau, bot → −10 ; pas écrasante si l'équipe du bot est intacte → écrasante (−28 → −14)
    const expected = end.ranked?.crushing ? -14 : -10;
    expect(await pcOf(a)).toBe(1000 + expected);
    expect(end.ranked?.sides[1]).toBeNull();
  }, 60_000);

  it("protection : une montée de rang protège 3 parties du retour au rang inférieur", async () => {
    const { a, b, battleId } = await rankedMatch(590, 590);
    await finishAfterTurns(battleId, [a, b], b);
    expect(await pcOf(a)).toBeGreaterThanOrEqual(600);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a }, select: { rankProtection: true } })).rankProtection).toBe(3);
    // Défaite juste après : a ne redescend pas sous 600
    await prisma.user.update({ where: { id: a }, data: { rankPoints: 605 } });
    const c = await player(605);
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "RANKED" }, ctx());
    const res = await joinQueueWith(prisma, { userId: c, cardIds: team(), mode: "RANKED" }, ctx());
    if (res.state !== "MATCHED") throw new Error("pas d'appariement");
    await finishAfterTurns(res.battleId, [a, c], a);
    expect(await pcOf(a)).toBe(600);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a }, select: { rankProtection: true } })).rankProtection).toBe(2);
  }, 180_000);

  it("Grand Champion : au-dessus du seuil et dans le top, marqué pour la saison", async () => {
    const top = (await prisma.user.count({ where: { rankPoints: { gt: 0 } } })) + 10;
    const c = ctx({ grandChampion: { ...DEFAULT_RANKED_RULES.grandChampion, min: 1800, top } });
    const [a, b] = [await player(1850), await player(1850)];
    await joinQueueWith(prisma, { userId: a, cardIds: team(), mode: "RANKED" }, c);
    const res = await joinQueueWith(prisma, { userId: b, cardIds: team(), mode: "RANKED" }, c);
    if (res.state !== "MATCHED") throw new Error("pas d'appariement");
    expect((await battle(res.battleId)).p1Tier).toBe("GRAND_CHAMPION");
    for (let i = 0; i < 2; i++) {
      const row = await battle(res.battleId);
      await playActionWith(prisma, { userId: row.state.active === 0 ? a : b, battleId: res.battleId, version: row.version, action: { type: "END_TURN" } }, c);
    }
    const row = await battle(res.battleId);
    const u = await playActionWith(prisma, { userId: b, battleId: res.battleId, version: row.version, action: { type: "FORFEIT" } }, c);
    expect(u.ranked?.sides[0]).toMatchObject({ grandBefore: true, grandAfter: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a }, select: { seasonPeakGrand: true } })).seasonPeakGrand).toBe(true);
  }, 120_000);

  it("fin de saison : idempotente, remise à zéro exacte, lot réclamé une seule fois", async () => {
    const lot = await prisma.lot.create({ data: { name: { fr: "Test saison", en: "Season test" }, zeni: 77 }, select: { id: true } });
    lots.push(lot.id);
    const r = { ...DEFAULT_RANKED_RULES, rewardLots: { ...DEFAULT_RANKED_RULES.rewardLots, ELITE: lot.id } };
    const [a] = [await player(1300)];
    await prisma.user.update({ where: { id: a }, data: { seasonGames: 4, seasonPeakPc: 1350 } });
    const now = new Date();
    const runs = await Promise.allSettled([0, 1].map(() => rollSeasonWith(prisma, now, r, "Europe/Paris", { force: true })));
    const closed = runs.filter((x) => x.status === "fulfilled" && x.value.closed).length;
    expect(closed).toBeGreaterThanOrEqual(1);
    const res = await prisma.seasonResult.findMany({ where: { userId: a } });
    expect(res.length).toBeGreaterThanOrEqual(1);
    const result = res.find((x) => x.lotId === lot.id)!;
    expect(result).toMatchObject({ finalPc: 1300, peakPc: 1350, peakTier: "ELITE", games: 4 });
    expect(await pcOf(a)).toBe(950); // 600 + (1300 − 600) / 2
    const claims = await Promise.allSettled(
      [0, 1].map(() => claimSeasonRewardWith(prisma, { userId: a, seasonId: result.seasonId, now: new Date() }, { rng: seededRng(1), loadPool: async () => ({ COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] }) })),
    );
    expect(claims.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const coins = await prisma.coinTransaction.findMany({ where: { userId: a, reason: "SEASON" } });
    expect(coins.map((c) => c.amount)).toEqual([77]);
  }, 180_000);
});
