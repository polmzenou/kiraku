import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { parseEntryCards, rankEntries } from "@/lib/event/showcase";
import { THEMES_DEFAULT } from "@/lib/showcase/themes";
import { createPgAdapter } from "@/server/pg-adapter";
import { createShowcaseWith, setShowcaseCardsWith } from "../showcase/core";
import {
  clearShowcaseVoteWith,
  enterShowcaseEventWith,
  removeShowcaseEntryByAdminWith,
  ShowcaseEventError,
  voteShowcaseEntryWith,
  withdrawShowcaseEntryWith,
} from "./showcase-core";

// Event vitrines sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/event/showcase-core.db.test.ts
// Crée sa série, ses cartes et des joueurs jetables, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("event vitrines (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const edition = `test-${tag}`;
  const seriesId = `test-series-${tag}`;
  const cards = Array.from({ length: 6 }, (_, i) => `test-card-${tag}-${i}`);
  const users: string[] = [];
  const live = { enabled: true, phase: "live" as const };

  async function player(isGuest = false) {
    const user = await prisma.user.create({ data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest } });
    users.push(user.id);
    return user.id;
  }

  async function give(userId: string, cardId: string) {
    return (await prisma.userCard.create({ data: { ownerId: userId, cardId }, select: { id: true } })).id;
  }

  /** Joueur avec une vitrine Grille 3 × 2 garnie des cartes données. */
  async function withShowcase(cardIds: readonly string[]) {
    const userId = await player();
    for (const id of cardIds) await give(userId, id);
    const showcaseId = await createShowcaseWith(prisma, userId, { name: "Ma vitrine", layout: "GRID_3X2", theme: "byobu", cards: cardIds }, 6);
    return { userId, showcaseId };
  }

  const enter = (userId: string, showcaseId: string, minCards = 1) =>
    enterShowcaseEventWith(prisma, { userId, showcaseId, edition, minCards, themes: THEMES_DEFAULT });

  async function code(run: Promise<unknown>) {
    try {
      await run;
      return null;
    } catch (e) {
      if (e instanceof ShowcaseEventError) return e.code;
      throw e;
    }
  }

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Event" } });
    await prisma.card.createMany({
      data: cards.map((id, i) => ({ id, name: `Carte ${i}`, imageUrl: "", favorites: 0, power: 10, ki: 10, seriesId, searchText: `carte ${i}`, rarity: "COMMON" })),
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction([
      prisma.showcaseEventVote.deleteMany({ where: { edition } }),
      prisma.showcaseEventEntry.deleteMany({ where: { edition } }),
      prisma.adminLog.deleteMany({ where: { adminId: { in: users } } }),
      prisma.showcase.deleteMany({ where: { userId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("fige la vitrine : la modifier ou donner une carte ne change pas l'inscription", async () => {
    const { userId, showcaseId } = await withShowcase([cards[0], cards[1], cards[2]]);
    const { id } = await enter(userId, showcaseId);
    // La vitrine change ensuite, et une carte change de main (elle quitte toutes les vitrines)
    await setShowcaseCardsWith(prisma, userId, showcaseId, [cards[1]]);
    const other = await player();
    const copy = await prisma.userCard.findFirstOrThrow({ where: { ownerId: userId, cardId: cards[1] }, select: { id: true } });
    await prisma.showcaseItem.deleteMany({ where: { userCardId: copy.id } });
    await prisma.userCard.update({ where: { id: copy.id }, data: { ownerId: other } });
    const entry = await prisma.showcaseEventEntry.findUniqueOrThrow({ where: { id } });
    expect(parseEntryCards(entry.cards)).toEqual([
      { position: 1, cardId: cards[0] },
      { position: 2, cardId: cards[1] },
      { position: 3, cardId: cards[2] },
    ]);
    expect({ name: entry.name, layout: entry.layout, theme: entry.theme, showcaseId: entry.showcaseId }).toEqual({ name: "Ma vitrine", layout: "GRID_3X2", theme: "byobu", showcaseId });
  }, 60_000);

  it("une seule inscription, ni pour un invité, ni avec la vitrine d'un autre, ni sous le minimum", async () => {
    const { userId, showcaseId } = await withShowcase([cards[0], cards[1]]);
    expect(await code(enter(userId, showcaseId, 3))).toBe("TOO_FEW_CARDS");
    await enter(userId, showcaseId);
    expect(await code(enter(userId, showcaseId))).toBe("ALREADY_ENTERED");
    const stranger = await player();
    expect(await code(enter(stranger, showcaseId))).toBe("NOT_FOUND");
    const guest = await player(true);
    expect(await code(enter(guest, showcaseId))).toBe("GUEST");
  }, 60_000);

  it("vote, change d'avis, refuse sa propre vitrine ; un retrait efface les votes et permet de se réinscrire", async () => {
    const a = await withShowcase([cards[0]]);
    const b = await withShowcase([cards[1]]);
    const voter = await player();
    const entryA = (await enter(a.userId, a.showcaseId)).id;
    const entryB = (await enter(b.userId, b.showcaseId)).id;

    expect(await code(voteShowcaseEntryWith(prisma, { voterId: a.userId, edition, entryId: entryA, ...live }))).toBe("OWN_ENTRY");
    expect(await code(voteShowcaseEntryWith(prisma, { voterId: voter, edition, entryId: entryA, enabled: true, phase: "ended" }))).toBe("CLOSED");
    expect(await code(voteShowcaseEntryWith(prisma, { voterId: voter, edition: "autre", entryId: entryA, ...live }))).toBe("NOT_FOUND");

    await voteShowcaseEntryWith(prisma, { voterId: voter, edition, entryId: entryA, ...live });
    await voteShowcaseEntryWith(prisma, { voterId: a.userId, edition, entryId: entryB, ...live });
    await voteShowcaseEntryWith(prisma, { voterId: voter, edition, entryId: entryB, ...live });
    expect(await prisma.showcaseEventVote.count({ where: { edition, entryId: entryB } })).toBe(2);
    expect(await prisma.showcaseEventVote.count({ where: { edition, entryId: entryA } })).toBe(0);

    await clearShowcaseVoteWith(prisma, { voterId: a.userId, edition });
    expect(await prisma.showcaseEventVote.count({ where: { edition, entryId: entryB } })).toBe(1);

    await withdrawShowcaseEntryWith(prisma, { userId: b.userId, edition });
    expect(await prisma.showcaseEventVote.count({ where: { edition, voterId: voter } })).toBe(0);
    expect(await code(withdrawShowcaseEntryWith(prisma, { userId: b.userId, edition }))).toBe("NOT_FOUND");
    expect(await code(voteShowcaseEntryWith(prisma, { voterId: voter, edition, entryId: entryB, ...live }))).toBe("NOT_FOUND");
    const again = await enter(b.userId, b.showcaseId);
    expect(again.id).not.toBe(entryB);
  }, 60_000);

  it("classe par votes, et l'admin peut retirer une inscription avec une ligne de journal", async () => {
    const a = await withShowcase([cards[3]]);
    const b = await withShowcase([cards[4]]);
    const entryA = (await enter(a.userId, a.showcaseId)).id;
    const entryB = (await enter(b.userId, b.showcaseId)).id;
    for (let i = 0; i < 2; i++) await voteShowcaseEntryWith(prisma, { voterId: await player(), edition, entryId: entryB, ...live });
    await voteShowcaseEntryWith(prisma, { voterId: await player(), edition, entryId: entryA, ...live });
    const groups = await prisma.showcaseEventVote.groupBy({ by: ["entryId"], where: { edition, entryId: { in: [entryA, entryB] } }, _count: { _all: true }, _max: { updatedAt: true } });
    const ranked = rankEntries(groups.map((g) => ({ entryId: g.entryId, votes: g._count._all, lastVoteAt: g._max.updatedAt?.getTime() ?? null, createdAt: 0 })));
    expect(ranked.map((r) => [r.entryId, r.votes, r.rank])).toEqual([[entryB, 2, 1], [entryA, 1, 2]]);

    const admin = await player();
    await removeShowcaseEntryByAdminWith(prisma, { adminId: admin, entryId: entryB });
    expect(await prisma.showcaseEventEntry.count({ where: { id: entryB } })).toBe(0);
    expect(await prisma.showcaseEventVote.count({ where: { entryId: entryB } })).toBe(0);
    const log = await prisma.adminLog.findFirstOrThrow({ where: { adminId: admin, targetId: entryB } });
    expect(log.action).toBe("SHOWCASE_EVENT_ENTRY_REMOVE");
    expect(await code(removeShowcaseEntryByAdminWith(prisma, { adminId: admin, entryId: entryB }))).toBe("NOT_FOUND");
  }, 60_000);
});
