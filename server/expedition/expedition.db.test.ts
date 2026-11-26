import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { seededRng } from "@/lib/rng";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { createPgAdapter } from "@/server/pg-adapter";
import { recycleWith } from "../collection/recycle-core";
import { setShowcaseCardsWith, createShowcaseWith } from "../showcase/core";
import {
  abandonWith,
  ensureBoardWith,
  ExpeditionError,
  launchWith,
  markRevealedWith,
  overdueCountWith,
  recallWith,
  settleExpeditionWith,
  sweepDueWith,
  type ExpeditionCtx,
  type SettleDeps,
} from "./expedition-core";

// Expéditions sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/expedition/expedition.db.test.ts
// Crée sa série, ses cartes, son type de booster, ses modèles et des joueurs jetables, puis supprime
// uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("expéditions (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const seriesId = `test-series-${tag}`;
  // 0-2 : Mythiques, 3-5 : Communes
  const cards = Array.from({ length: 6 }, (_, i) => `test-card-${tag}-${i}`);
  const users: string[] = [];
  const typeIds: string[] = [];
  const lots: string[] = [];
  let boosterTypeId = "";

  const rules = {
    enabled: true,
    offersPerDay: 3,
    abandonCooldownHours: 3,
    cardBonus: SETTING_DEFAULTS["expedition.cardBonus"],
    triumphRewardPct: 150,
    failRewardPct: 25,
  };
  const DAY = "2026-11-16";
  const ctx = (now = new Date()): ExpeditionCtx => ({ now, dayKey: DAY, rules, definitions: BASE_DEFINITIONS, preview: false });
  // Tirage 0 : triomphe s'il y en a, sinon réussite
  const deps = (seed = 1, roll?: number): SettleDeps => ({
    rng: roll === undefined ? seededRng(seed) : () => roll,
    lot: { rng: seededRng(seed), loadPool: async () => ({}) as never },
  });

  async function player(coins = 0) {
    const user = await prisma.user.create({ data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false, coins } });
    users.push(user.id);
    return user.id;
  }

  async function give(userId: string, cardId: string) {
    return (await prisma.userCard.create({ data: { ownerId: userId, cardId }, select: { id: true } })).id;
  }

  /** Plateau du jour posé à la main (ordre des modèles connu). */
  async function board(userId: string) {
    await prisma.expeditionBoard.create({ data: { userId, dayKey: DAY, typeIds } });
  }

  async function code(run: Promise<unknown>) {
    try {
      await run;
      return null;
    } catch (e) {
      if (e instanceof ExpeditionError) return e.code;
      throw e;
    }
  }

  const team = (...idx: number[]) => idx.map((i) => cards[i]);

  /** Périlleuse d'une minute (Mythique exigée, 100 Zeni) dont le lot bonus verse 50 Zeni et une Mythique au hasard. */
  async function lotType() {
    const lot = await prisma.lot.create({
      data: { name: { fr: `Lot ${tag}`, en: "" }, zeni: 50, items: { create: [{ kind: "RARITY_CARD", rarity: "MYTHIC", quantity: 1 }] } },
      select: { id: true },
    });
    lots.push(lot.id);
    const type = await prisma.expeditionType.create({
      data: {
        slug: `test-lot-${tag}-${lots.length}`,
        name: { fr: "Lot", en: "" },
        lore: {},
        minRarity: "MYTHIC",
        risk: "RISKY",
        durationMinutes: 1,
        baseSuccessPct: 0,
        maxSuccessPct: 80,
        maxTriumphPct: 10,
        zeni: 100,
        boosterTypeId,
        boosters: 0,
        extraLotId: lot.id,
        weight: 0,
        active: true,
      },
      select: { id: true },
    });
    typeIds.push(type.id);
    return { lotId: lot.id, typeId: type.id, slot: typeIds.length - 1 };
  }

  /** Tirage 0 (réussite) ; les cartes « par rareté » des lots sortent de `pool`. */
  const lotDeps = (pool: Record<string, string[]>): SettleDeps => ({ rng: () => 0, lot: { rng: () => 0, loadPool: async () => pool } });

  /** Réécrit la photo d'une expédition (photo corrompue, gains hors bornes). */
  async function patchSnapshot(id: string, patch: (snap: Record<string, unknown>) => void) {
    const row = await prisma.expedition.findUniqueOrThrow({ where: { id }, select: { snapshot: true } });
    const snap = structuredClone(row.snapshot) as Record<string, unknown>;
    patch(snap);
    await prisma.expedition.update({ where: { id }, data: { snapshot: snap as never } });
  }

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Expéditions" } });
    await prisma.card.createMany({
      data: cards.map((id, i) => ({
        id,
        name: `Carte ${i}`,
        imageUrl: "",
        favorites: 0,
        power: 10,
        ki: 10,
        seriesId,
        searchText: `carte ${i}`,
        rarity: i < 3 ? "MYTHIC" : "COMMON",
      })),
    });
    boosterTypeId = (
      await prisma.boosterType.create({
        data: {
          slug: `test-exp-${tag}`,
          kind: "STANDARD",
          family: "standard",
          name: { fr: "Test" },
          tagline: { fr: "Test" },
          emblem: "並",
          theme: { base: "#222", dark: "#111", pattern: "kumo", ink: "light" },
          slotFloors: [],
          featuredCardIds: [],
          poolCardIds: [],
          active: false,
        },
        select: { id: true },
      })
    ).id;
    const base = { lore: {}, boosterTypeId, extraLotId: null, weight: 0, active: true };
    // 0 : Mythique équilibrée (60 → 92 %), 1 : Mythique sûre, 2 : Mythique périlleuse d'une minute
    for (const t of [
      { slug: `test-a-${tag}`, risk: "BALANCED" as const, durationMinutes: 360, baseSuccessPct: 50, maxSuccessPct: 92, maxTriumphPct: 15, zeni: 1000, boosters: 5 },
      { slug: `test-b-${tag}`, risk: "SAFE" as const, durationMinutes: 180, baseSuccessPct: 100, maxSuccessPct: 100, maxTriumphPct: 25, zeni: 400, boosters: 3 },
      { slug: `test-c-${tag}`, risk: "RISKY" as const, durationMinutes: 1, baseSuccessPct: 0, maxSuccessPct: 80, maxTriumphPct: 10, zeni: 2000, boosters: 8 },
    ]) {
      const row = await prisma.expeditionType.create({ data: { ...t, ...base, name: { fr: t.slug, en: "" }, minRarity: "MYTHIC" }, select: { id: true } });
      typeIds.push(row.id);
    }
  }, 30_000);

  afterAll(async () => {
    const where = { userId: { in: users } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where }),
      prisma.coinTransaction.deleteMany({ where }),
      prisma.boosterCredit.deleteMany({ where }),
      prisma.expedition.deleteMany({ where }),
      prisma.expeditionBoard.deleteMany({ where }),
      prisma.showcase.deleteMany({ where }),
      prisma.adminLog.deleteMany({ where: { adminId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.expeditionType.deleteMany({ where: { id: { in: typeIds } } }),
      prisma.lot.deleteMany({ where: { id: { in: lots } } }),
      prisma.boosterType.deleteMany({ where: { id: boosterTypeId } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("lance, bloque les cartes et ne laisse partir qu'une expédition à la fois", async () => {
    const a = await player();
    for (const c of team(0, 3, 4, 5)) await give(a, c);
    await board(a);
    // Deux départs simultanés : un seul passe
    const results = await Promise.all([
      code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx())),
      code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 1, typeId: typeIds[1], cardIds: team(0, 3, 5) }, ctx())),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(await prisma.expedition.count({ where: { userId: a, status: "ACTIVE" } })).toBe(1);
    const exp = await prisma.expedition.findFirstOrThrow({ where: { userId: a, status: "ACTIVE" } });
    const locked = await prisma.userCard.findMany({ where: { id: { in: exp.userCardIds } }, select: { status: true } });
    expect(locked.map((c) => c.status)).toEqual(["EXPEDITION", "EXPEDITION", "EXPEDITION"]);
    // 1 Mythique + 2 Communes : 50 + 10 = 60 %
    if (exp.typeId === typeIds[0]) expect(exp.successPct).toBe(6000);
  }, 60_000);

  it("refuse une équipe sans la rareté exigée, une offre périmée et une carte non possédée", async () => {
    const a = await player();
    for (const c of team(0, 3, 4, 5)) await give(a, c);
    await board(a);
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(3, 4, 5) }, ctx()))).toBe("NOT_QUALIFIED");
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[1], cardIds: team(0, 3, 4) }, ctx()))).toBe("STALE");
    expect(await code(launchWith(prisma, { userId: a, dayKey: "2026-11-15", slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx()))).toBe("STALE");
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(1, 3, 4) }, ctx()))).toBe("NOT_OWNED");
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 0, 4) }, ctx()))).toBe("TEAM");
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, { ...ctx(), rules: { ...rules, enabled: false } }))).toBe("DISABLED");
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "EXPEDITION" } })).toBe(0);
  }, 60_000);

  it("les cartes parties échappent au recyclage et restent dans les vitrines", async () => {
    const a = await player();
    await give(a, cards[0]);
    const newest = await give(a, cards[0]);
    for (const c of team(3, 4)) await give(a, c);
    const showcase = await createShowcaseWith(prisma, a, { name: null, theme: "none", layout: "GRID_2X2" }, 6);
    await setShowcaseCardsWith(prisma, a, showcase, [cards[3]]);
    await board(a);
    await launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx());
    // Le plus récent hors vitrine part ; recycler les doublons de la carte 0 ne touche pas à l'exemplaire parti
    expect((await prisma.userCard.findUniqueOrThrow({ where: { id: newest } })).status).toBe("EXPEDITION");
    await recycleWith(prisma, a, { kind: "card", cardId: cards[0], count: 1 }, SETTING_DEFAULTS["collection.recycleValues"]).catch(() => null);
    expect(await prisma.userCard.count({ where: { ownerId: a, cardId: cards[0] } })).toBe(2);
    // La vitrine se réenregistre avec la carte partie
    await setShowcaseCardsWith(prisma, a, showcase, [cards[3], null]);
    expect(await prisma.showcaseItem.count({ where: { showcaseId: showcase } })).toBe(1);
  }, 60_000);

  it("abandon : cartes rendues, aucune gain, attente avant la suivante, l'offre reste jouable", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    await board(a);
    const now = new Date();
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx(now));
    const res = await abandonWith(prisma, { userId: a, expeditionId: id }, ctx(now), deps());
    expect(res.state).toBe("ABANDONED");
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "COLLECTION" } })).toBe(3);
    expect(await prisma.coinTransaction.count({ where: { userId: a } })).toBe(0);
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx(new Date(now.getTime() + 3_600_000))))).toBe(
      "COOLDOWN",
    );
    // Après les 3 h : la même offre se relance
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 0, typeId: typeIds[0], cardIds: team(0, 3, 4) }, ctx(new Date(now.getTime() + 3 * 3_600_000 + 1000))))).toBeNull();
  }, 60_000);

  it("clôture : une seule fois même en parallèle, gains au journal, cartes rendues, relance immédiate", async () => {
    const a = await player(100);
    for (const c of team(0, 1, 2, 3)) await give(a, c);
    await board(a);
    const start = new Date(Date.now() - 120_000);
    // Périlleuse d'une minute, 3 Mythiques : 0 + 30 = 30 % ; tirage 0 → réussite
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 1, 2) }, ctx(start));
    const now = new Date();
    const settled = await Promise.all([settleExpeditionWith(prisma, id, now, deps(1, 0)), settleExpeditionWith(prisma, id, now, deps(1, 0)), settleExpeditionWith(prisma, id, now, deps(1, 0))]);
    expect(settled.filter(Boolean)).toHaveLength(1);
    const row = await prisma.expedition.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "COMPLETED", outcome: "SUCCESS", roll: 0 });
    expect(await prisma.coinTransaction.count({ where: { userId: a, reason: "EXPEDITION", refId: id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).coins).toBe(2100);
    expect((await prisma.boosterCredit.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: a, boosterTypeId } } })).count).toBe(8);
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "EXPEDITION" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: a, type: "EXPEDITION_RETURNED", refId: id } })).toBe(1);
    // Solde = journal
    const sum = await prisma.coinTransaction.aggregate({ where: { userId: a }, _sum: { amount: true } });
    expect(100 + (sum._sum.amount ?? 0)).toBe(2100);
    // Relance immédiate d'une autre offre ; la même offre ne se rejoue pas
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 1, 2) }, ctx()))).toBe("DONE");
    expect(await code(launchWith(prisma, { userId: a, dayKey: DAY, slot: 1, typeId: typeIds[1], cardIds: team(0, 1, 3) }, ctx()))).toBeNull();
    // Révélation marquée une seule fois
    expect(await markRevealedWith(prisma, { userId: a, expeditionId: id, now })).toBe(true);
    expect(await markRevealedWith(prisma, { userId: a, expeditionId: id, now })).toBe(false);
  }, 60_000);

  it("échec : consolation en Zeni, aucun booster ; abandon à l'arrivée = clôture", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    await board(a);
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 3, 4) }, ctx(new Date(Date.now() - 120_000)));
    // 1 Mythique : 10 % ; tirage 9 999 → échec. L'abandon arrive après la fin : il clôt l'expédition.
    const res = await abandonWith(prisma, { userId: a, expeditionId: id }, ctx(), deps(1, 9_999));
    expect(res.state).toBe("SETTLED");
    expect((await prisma.expedition.findUniqueOrThrow({ where: { id } })).outcome).toBe("FAILURE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).coins).toBe(500);
    expect(await prisma.boosterCredit.count({ where: { userId: a } })).toBe(0);
  }, 60_000);

  it("lot bonus : la copie prise au départ est versée même si l'admin vide le lot, et résumée pour le rapport", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    const { lotId, typeId, slot } = await lotType();
    await board(a);
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot, typeId, cardIds: team(0, 3, 4) }, ctx(new Date(Date.now() - 120_000)));
    await prisma.lot.update({ where: { id: lotId }, data: { zeni: 0, items: { deleteMany: {} } } });
    // 1 Mythique : 10 % ; tirage 0 → réussite (Zeni du modèle et lot)
    const settled = await settleExpeditionWith(prisma, id, new Date(), lotDeps({ MYTHIC: [cards[2]] }));
    expect(settled?.outcome).toBe("SUCCESS");
    const row = await prisma.expedition.findUniqueOrThrow({ where: { id } });
    expect(row.rewardCardIds).toEqual([cards[2]]);
    expect(row.lotGrant).toEqual({ zeni: 50, boosters: [] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).coins).toBe(150);
    expect(await prisma.userCard.count({ where: { ownerId: a, cardId: cards[2] } })).toBe(1);
  }, 60_000);

  it("pool vide : l'expédition rentre sans son lot au lieu de rester bloquée", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    const { typeId, slot } = await lotType();
    await board(a);
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot, typeId, cardIds: team(0, 3, 4) }, ctx(new Date(Date.now() - 120_000)));
    expect((await settleExpeditionWith(prisma, id, new Date(), lotDeps({ MYTHIC: [] })))?.outcome).toBe("SUCCESS");
    expect(await prisma.expedition.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "COMPLETED", rewardCardIds: [], lotGrant: null });
    // Zeni du modèle seulement, cartes rendues
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).coins).toBe(100);
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "EXPEDITION" } })).toBe(0);
  }, 60_000);

  it("photo au nom illisible : la clôture verse quand même les gains", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    await board(a);
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 3, 4) }, ctx(new Date(Date.now() - 120_000)));
    await patchSnapshot(id, (snap) => {
      snap.name = 42;
      snap.lore = null;
    });
    expect((await settleExpeditionWith(prisma, id, new Date(), deps(1, 0)))?.outcome).toBe("SUCCESS");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).coins).toBe(2000);
    expect((await prisma.boosterCredit.findUniqueOrThrow({ where: { userId_boosterTypeId: { userId: a, boosterTypeId } } })).count).toBe(8);
  }, 60_000);

  it("abandon et clôture simultanés à l'arrivée : une seule issue, gains versés une fois", async () => {
    const a = await player();
    for (const c of team(0, 3, 4)) await give(a, c);
    await board(a);
    const { id } = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 3, 4) }, ctx(new Date(Date.now() - 120_000)));
    const now = new Date();
    await Promise.allSettled([abandonWith(prisma, { userId: a, expeditionId: id }, ctx(now), deps(1, 0)), settleExpeditionWith(prisma, id, now, deps(1, 0))]);
    expect((await prisma.expedition.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
    expect(await prisma.coinTransaction.count({ where: { userId: a, refId: id } })).toBe(1);
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "EXPEDITION" } })).toBe(0);
  }, 60_000);

  it("balayage : une clôture en échec n'arrête pas les autres, reste comptée, puis le rappel admin la débloque", async () => {
    const [a, b] = [await player(), await player()];
    for (const u of [a, b]) {
      for (const c of team(0, 3, 4)) await give(u, c);
      await board(u);
    }
    const start = new Date(Date.now() - 120_000);
    const bad = await launchWith(prisma, { userId: a, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 3, 4) }, ctx(start));
    const good = await launchWith(prisma, { userId: b, dayKey: DAY, slot: 2, typeId: typeIds[2], cardIds: team(0, 3, 4) }, ctx(start));
    // Gains au-delà de ce qu'accepte le grand livre : la clôture de `bad` échoue à chaque essai
    await patchSnapshot(bad.id, (snap) => {
      for (const r of Object.values(snap.rewards as Record<string, { zeni: number }>)) r.zeni = 1e15;
    });
    const now = new Date();
    expect((await sweepDueWith(prisma, now, 100, deps(1, 0))).settled).toBeGreaterThanOrEqual(1);
    expect((await prisma.expedition.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("ACTIVE");
    expect((await prisma.expedition.findUniqueOrThrow({ where: { id: good.id } })).status).toBe("COMPLETED");
    expect(await overdueCountWith(prisma, now)).toBeGreaterThanOrEqual(1);
    // Rappel : cartes rendues, sans gain ni attente, journal admin
    await recallWith(prisma, { adminId: b, expeditionId: bad.id, now });
    expect(await prisma.expedition.findUniqueOrThrow({ where: { id: bad.id } })).toMatchObject({ status: "ABANDONED", cooldownUntil: null });
    expect(await prisma.userCard.count({ where: { ownerId: a, status: "EXPEDITION" } })).toBe(0);
    expect(await prisma.coinTransaction.count({ where: { userId: a } })).toBe(0);
    expect(await prisma.adminLog.count({ where: { action: "EXPEDITION_RECALL", targetId: bad.id } })).toBe(1);
  }, 60_000);

  it("fige le plateau du jour à la première lecture", async () => {
    const a = await player();
    await prisma.expeditionType.updateMany({ where: { id: { in: typeIds } }, data: { weight: 1 } });
    try {
      const first = await Promise.all([ensureBoardWith(prisma, a, ctx()), ensureBoardWith(prisma, a, ctx())]);
      expect(first[0]).toEqual(first[1]);
      expect(await prisma.expeditionBoard.count({ where: { userId: a } })).toBe(1);
    } finally {
      await prisma.expeditionType.updateMany({ where: { id: { in: typeIds } }, data: { weight: 0 } });
    }
  }, 60_000);
});
