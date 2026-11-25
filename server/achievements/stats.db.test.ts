import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import type { ProfileStats } from "@/lib/profile/conditions";
import { createPgAdapter } from "@/server/pg-adapter";
import { consumeWishlist } from "../collection/wishlist-core";
import { getAchievementStatsWith } from "./stats-core";

// Statistiques des succès relues sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/achievements/stats.db.test.ts
// Crée des joueurs, des cartes et un historique jetables, puis supprime ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;
const TZ = "Europe/Paris";
const EMPTY_PROFILE: ProfileStats = {
  uniqueCards: 0,
  byRarity: {},
  completedSeries: new Set(),
  seriesProgress: {},
  boostersOpened: 0,
  tradesDone: 0,
  apocalypseRuined: 0,
  tier: null,
  discoveredPercent: 0,
  discoveredByRarity: {},
  ambassador: false,
};

describe.skipIf(!url)("statistiques des succès (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const users: string[] = [];
  const cards: string[] = [];
  let seriesId = "";
  let seasonId = "";
  let me = "";
  let rival = "";
  const card: Record<"base" | "mythicA" | "mythicB" | "ar" | "gold" | "mr", string> = { base: "", mythicA: "", mythicB: "", ar: "", gold: "", mr: "" };

  const at = (iso: string) => new Date(iso);
  const stats = (needed: string[]) =>
    getAchievementStatsWith(prisma, me, new Set(needed), { timeZone: TZ, now: at("2026-11-25T12:00:00Z"), loadProfile: async () => EMPTY_PROFILE });

  async function newCard(rarity: string, over: Partial<Prisma.CardUncheckedCreateInput> = {}) {
    const n = cards.length;
    const c = await prisma.card.create({
      data: {
        name: `Ach ${tag} ${n}`,
        imageUrl: `https://example.test/${tag}-${n}.png`,
        favorites: 1,
        rarity,
        power: 10,
        ki: 10,
        seriesId,
        searchText: `ach ${tag} ${n}`,
        rank: 900_000 + Number.parseInt(tag.slice(0, 4), 16) * 10 + n,
        ...over,
      },
    });
    cards.push(c.id);
    return c.id;
  }

  async function player() {
    const user = await prisma.user.create({ data: { username: `ach-${tag}-${users.length}`, isGuest: false } });
    users.push(user.id);
    return user.id;
  }

  async function opening(createdAt: string, catalogCardIds: string[], apocalypse?: "RUINED" | "SPARED") {
    await prisma.boosterOpening.create({ data: { userId: me, boosterSlug: "standard", cardIds: [], catalogCardIds, createdAt: at(createdAt), apocalypse } });
  }

  beforeAll(async () => {
    seriesId = (await prisma.series.create({ data: { type: "ANIME", titleRomaji: `Achievements ${tag}` } })).id;
    me = await player();
    rival = await player();
    card.base = await newCard("COMMON", { birthMonth: 3, birthDay: 15 });
    card.mythicA = await newCard("MYTHIC");
    card.mythicB = await newCard("MYTHIC");
    card.ar = await newCard("AR", { variantOfId: card.base });
    card.gold = await newCard("GOLD", { variantOfId: card.base });
    card.mr = await newCard("MR", { variantOfId: card.base });

    // Ouvertures : anniversaire du personnage (15 mars, heure de Paris), 3 h 30 du matin, deux Mythiques, Apocalyptiques
    await opening("2026-03-15T10:00:00Z", [card.base]);
    await opening("2026-03-16T02:30:00Z", [card.mythicA, card.mythicB]);
    for (const [i, outcome] of (["RUINED", "RUINED", "SPARED", "RUINED", "RUINED", "RUINED"] as const).entries()) {
      await opening(`2026-04-0${i + 1}T12:00:00Z`, [card.base], outcome);
    }
    // Découvertes : la base et trois de ses variantes
    await prisma.discovery.createMany({ data: [card.base, card.ar, card.gold, card.mr].map((cardId) => ({ userId: me, cardId })) });

    // Récompense quotidienne : 1, 2, 3 puis 5 janvier ; un solde de 77 777 Zeni
    for (const day of ["2026-01-01T09:00:00Z", "2026-01-02T22:30:00Z", "2026-01-03T09:00:00Z", "2026-01-05T09:00:00Z"]) {
      await prisma.coinTransaction.create({ data: { userId: me, amount: 10, reason: "DAILY", createdAt: at(day) } });
    }
    await prisma.coinTransaction.create({ data: { userId: me, amount: 77_777, reason: "ADMIN", balanceAfter: 77_777 } });

    // Combats : V V D V V V ; la première victoire avec trois Communes d'un même univers
    const team = (rarity: string, universes: string[]) => universes.map((key) => ({ rarity, universe: { key, name: key } }));
    const results: [boolean, unknown][] = [
      [true, team("COMMON", ["u1", "u1", "u1"])],
      [true, team("RARE", ["u1", "u2", "u2"])],
      [false, team("COMMON", ["u1", "u1", "u1"])],
      [true, team("EPIC", ["u3", "u4", "u5"])],
      [true, team("COMMON", ["u1", "u2", "u3"])],
      [true, team("RARE", ["u1", "u1", "u2"])],
    ];
    for (const [i, [won, mine]] of results.entries()) {
      await prisma.battle.create({
        data: {
          mode: "EXHIBITION",
          status: "FINISHED",
          seed: 1,
          p1Id: me,
          botName: "Tengu",
          winnerSide: won ? 0 : 1,
          setup: { teams: [mine, team("RARE", ["x", "y", "z"])] } as Prisma.InputJsonValue,
          endedAt: at(`2026-05-0${i + 1}T12:00:00Z`),
        },
      });
    }

    // Pile ou face : cinq défaites puis une victoire
    for (let i = 0; i < 6; i++) {
      const won = i === 5;
      await prisma.coinFlip.create({
        data: {
          status: "DONE",
          creatorId: me,
          creatorUserCardId: `uc-${tag}-${i}`,
          creatorCardId: card.base,
          creatorRarity: "COMMON",
          creatorSide: "OMOTE",
          tierOrder: 0,
          opponentId: rival,
          opponentUserCardId: `uc-${tag}-o${i}`,
          opponentCardId: card.base,
          opponentRarity: "COMMON",
          seed: "a".repeat(64),
          seedHash: "b".repeat(64),
          result: won ? "OMOTE" : "URA",
          winnerId: won ? me : rival,
          expiresAt: at("2026-12-01T00:00:00Z"),
          resolvedAt: at(`2026-06-0${i + 1}T12:00:00Z`),
        },
      });
    }

    // Saison close : 2e place sur 3
    const third = await player();
    seasonId = (await prisma.season.create({ data: { number: 900_000 + Number.parseInt(tag.slice(0, 4), 16), startsAt: at("2026-01-01T00:00:00Z"), endsAt: at("2026-04-01T00:00:00Z") } })).id;
    await prisma.seasonResult.createMany({
      data: [
        { seasonId, userId: rival, finalPc: 300, peakPc: 300, peakTier: "GOLD", games: 10 },
        { seasonId, userId: me, finalPc: 200, peakPc: 220, peakTier: "SILVER", games: 60 },
        { seasonId, userId: third, finalPc: 100, peakPc: 100, peakTier: "BRONZE", games: 5 },
      ],
    });
  });

  afterAll(async () => {
    if (users.length > 0) await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (seasonId) await prisma.season.deleteMany({ where: { id: seasonId } });
    // Variantes d'abord : leur carte de base ne se supprime pas tant qu'elles existent
    if (cards.length > 0) {
      await prisma.card.deleteMany({ where: { id: { in: cards }, variantOfId: { not: null } } });
      await prisma.card.deleteMany({ where: { id: { in: cards } } });
    }
    if (seriesId) await prisma.series.deleteMany({ where: { id: seriesId } });
    await prisma.$disconnect();
  });

  it("boosters : anniversaire, heure de la nuit, deux Mythiques, série d'Apocalyptiques ruinés", async () => {
    const s = await stats(["BIRTHDAY_PULL", "NIGHT_OPENING:3", "NIGHT_OPENING:5", "DOUBLE_MYTHIC", "APOC_RUINED_STREAK", "APOC_RUINED", "APOC_SPARED", "OPENINGS"]);
    expect(s.values.get("BIRTHDAY_PULL")).toBe(1);
    expect(s.values.get("NIGHT_OPENING:3")).toBe(1);
    expect(s.values.get("NIGHT_OPENING:5")).toBe(0);
    expect(s.values.get("DOUBLE_MYTHIC")).toBe(1);
    expect(s.values.get("APOC_RUINED_STREAK")).toBe(3);
    expect(s.values.get("APOC_RUINED")).toBe(5);
    expect(s.values.get("APOC_SPARED")).toBe(1);
    expect(s.values.get("OPENINGS")).toBe(8);
  });

  it("collection : raretés découvertes, variantes d'un même personnage", async () => {
    const s = await stats(["RARITY:AR", "RARITY:XR", "VARIANT_FAMILY", "ALL_VARIANTS", "SERIES_TOUCHED"]);
    expect(s.values.get("RARITY:AR")).toBe(1);
    expect(s.values.get("RARITY:XR") ?? 0).toBe(0);
    expect(s.values.get("VARIANT_FAMILY")).toBe(3);
    expect(s.values.get("ALL_VARIANTS")).toBe(3);
    expect(s.goals.get("ALL_VARIANTS")).toBeGreaterThanOrEqual(3);
    expect(s.values.get("SERIES_TOUCHED")).toBeGreaterThanOrEqual(1);
  });

  it("Zeni : jours de récompense, plus longue série, solde exact", async () => {
    const s = await stats(["DAILY_DAYS", "DAILY_STREAK", "EXACT_BALANCE:77777", "EXACT_BALANCE:12", "MAX_BALANCE"]);
    expect(s.values.get("DAILY_DAYS")).toBe(4);
    expect(s.values.get("DAILY_STREAK")).toBe(3);
    expect(s.values.get("EXACT_BALANCE:77777")).toBe(1);
    expect(s.values.get("EXACT_BALANCE:12")).toBe(0);
    expect(s.values.get("MAX_BALANCE")).toBe(77_777);
  });

  it("combat : victoires, série, équipe d'un seul univers, équipe de Communes", async () => {
    const s = await stats(["BATTLES", "WINS", "WIN_STREAK", "MONO_UNIVERSE_WINS", "COMMONS_WINS"]);
    expect(s.values.get("BATTLES")).toBe(6);
    expect(s.values.get("WINS")).toBe(5);
    expect(s.values.get("WIN_STREAK")).toBe(3);
    expect(s.values.get("MONO_UNIVERSE_WINS")).toBe(1);
    expect(s.values.get("COMMONS_WINS")).toBe(2);
  });

  it("pile ou face : séries de défaites et de victoires", async () => {
    const s = await stats(["FLIPS", "FLIP_WINS", "FLIP_LOSS_STREAK", "FLIP_WIN_STREAK"]);
    expect(s.values.get("FLIPS")).toBe(6);
    expect(s.values.get("FLIP_WINS")).toBe(1);
    expect(s.values.get("FLIP_LOSS_STREAK")).toBe(5);
    expect(s.values.get("FLIP_WIN_STREAK")).toBe(1);
  });

  it("classé : meilleure place de fin de saison, parties dans une saison", async () => {
    const s = await stats(["SEASON_BEST", "SEASON_GAMES", "SEASONS_PLAYED"]);
    expect(s.values.get("SEASON_BEST")).toBe(2);
    expect(s.values.get("SEASON_GAMES")).toBe(60);
    expect(s.values.get("SEASONS_PLAYED")).toBe(1);
  });

  it("ne calcule que les statistiques demandées", async () => {
    const s = await stats(["WINS"]);
    expect([...s.values.keys()].sort()).toEqual(["BATTLES", "COMMONS_WINS", "CRUSHING_WINS", "FRIEND_WINS", "MONO_UNIVERSE_WINS", "WINS"]);
  });

  it("liste de souhaits exaucée : le succès est posé dans la transaction, une seule fois", async () => {
    await prisma.wishlistEntry.create({ data: { userId: me, cardId: card.mythicA, position: 1 } });
    await prisma.$transaction((tx) => consumeWishlist(tx, me, [card.mythicA]));
    await prisma.$transaction((tx) => consumeWishlist(tx, me, [card.mythicA]));
    const rows = await prisma.userAchievement.findMany({ where: { userId: me } });
    expect(rows.map((r) => r.key)).toEqual(["wish-granted"]);
  });
});
