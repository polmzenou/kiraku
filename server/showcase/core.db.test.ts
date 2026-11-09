import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPgAdapter } from "@/server/pg-adapter";
import {
  addShowcaseCardsWith,
  createShowcaseWith,
  deleteShowcaseWith,
  removeShowcaseCardWith,
  reorderShowcasesWith,
  setShowcaseCardsWith,
  ShowcaseError,
  updateShowcaseWith,
} from "./core";

// Vitrines multiples sur une vraie base (base de test isolée) : sauté sans DATABASE_URL_TEST.
//   DATABASE_URL_TEST="postgresql://…" npx vitest run server/showcase/core.db.test.ts
// Crée sa série, ses cartes et des joueurs jetables, puis supprime uniquement ce qu'il a créé.

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("vitrines multiples (base réelle)", () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const tag = randomBytes(4).toString("hex");
  const seriesId = `test-series-${tag}`;
  const cards = Array.from({ length: 10 }, (_, i) => `test-card-${tag}-${i}`);
  const users: string[] = [];

  async function player() {
    const user = await prisma.user.create({ data: { username: `test-${randomBytes(4).toString("hex")}`, isGuest: false } });
    users.push(user.id);
    return user.id;
  }

  async function give(userId: string, cardId: string, status: "COLLECTION" | "BATTLE" | "AUCTION" = "COLLECTION") {
    return (await prisma.userCard.create({ data: { ownerId: userId, cardId, status }, select: { id: true } })).id;
  }

  const blank = { name: null, theme: "none" } as const;

  async function code(run: Promise<unknown>) {
    try {
      await run;
      return null;
    } catch (e) {
      if (e instanceof ShowcaseError) return e.code;
      throw e;
    }
  }

  beforeAll(async () => {
    await prisma.series.create({ data: { id: seriesId, type: "ANIME", titleRomaji: "Vitrines" } });
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
        rarity: "COMMON",
      })),
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction([
      prisma.showcase.deleteMany({ where: { userId: { in: users } } }),
      prisma.userCard.deleteMany({ where: { ownerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
      prisma.card.deleteMany({ where: { id: { in: cards } } }),
      prisma.series.deleteMany({ where: { id: seriesId } }),
    ]);
    await prisma.$disconnect();
  }, 30_000);

  it("crée les vitrines à la suite et refuse au-delà du maximum", async () => {
    const a = await player();
    const first = await createShowcaseWith(prisma, a, { ...blank, layout: "GRID_3X2" }, 2);
    const second = await createShowcaseWith(prisma, a, { ...blank, layout: "SOLO" }, 2);
    expect(await code(createShowcaseWith(prisma, a, { ...blank, layout: "SOLO" }, 2))).toBe("LIMIT");
    const rows = await prisma.showcase.findMany({ where: { userId: a }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
    expect(rows).toEqual([{ id: first, sortOrder: 0 }, { id: second, sortOrder: 1 }]);
  }, 60_000);

  it("expose le même exemplaire dans deux vitrines et refuse une carte non possédée", async () => {
    const a = await player();
    const copy = await give(a, cards[0]);
    const one = await createShowcaseWith(prisma, a, { ...blank, layout: "GRID_2X2" }, 6);
    const two = await createShowcaseWith(prisma, a, { ...blank, layout: "DUO" }, 6);
    await setShowcaseCardsWith(prisma, a, one, [cards[0]]);
    await setShowcaseCardsWith(prisma, a, two, [null, cards[0]]);
    const items = await prisma.showcaseItem.findMany({ where: { showcase: { userId: a } }, select: { userCardId: true, position: true } });
    expect(items.map((i) => i.userCardId)).toEqual([copy, copy]);
    expect(await code(setShowcaseCardsWith(prisma, a, one, [cards[1]]))).toBe("NOT_OWNED");
    expect(await code(setShowcaseCardsWith(prisma, a, two, [cards[0], null, null]))).toBe("INVALID");
  }, 60_000);

  it("garde l'exemplaire déjà exposé, même parti en combat, et ignore celui en vente", async () => {
    const a = await player();
    const old = await give(a, cards[1]);
    const recent = await give(a, cards[1]);
    const id = await createShowcaseWith(prisma, a, { ...blank, layout: "GRID_2X2" }, 6);
    await setShowcaseCardsWith(prisma, a, id, [cards[1]]);
    expect((await prisma.showcaseItem.findFirstOrThrow({ where: { showcaseId: id } })).userCardId).toBe(old);
    await prisma.userCard.update({ where: { id: old }, data: { status: "BATTLE" } });
    await setShowcaseCardsWith(prisma, a, id, [null, cards[1]]);
    expect((await prisma.showcaseItem.findFirstOrThrow({ where: { showcaseId: id } })).userCardId).toBe(old);
    await give(a, cards[2], "AUCTION");
    expect(await code(setShowcaseCardsWith(prisma, a, id, [cards[2]]))).toBe("NOT_OWNED");
    expect(recent).not.toBe(old);
  }, 60_000);

  it("resserre les cartes quand la disposition rétrécit", async () => {
    const a = await player();
    for (const c of cards.slice(0, 4)) await give(a, c);
    const id = await createShowcaseWith(prisma, a, { ...blank, layout: "GRID_3X2" }, 6);
    await setShowcaseCardsWith(prisma, a, id, [cards[0], null, cards[1], null, cards[2], cards[3]]);
    expect(await updateShowcaseWith(prisma, a, id, { layout: "TRIO", name: "Trio" })).toEqual([cards[0], cards[1], cards[2]]);
    const showcase = await prisma.showcase.findUniqueOrThrow({ where: { id }, select: { layout: true, name: true } });
    expect(showcase).toEqual({ layout: "TRIO", name: "Trio" });
    expect(await prisma.showcaseItem.count({ where: { showcaseId: id } })).toBe(3);
  }, 60_000);

  it("ajoute dans les cases libres, retire, et refuse quand la vitrine est pleine", async () => {
    const a = await player();
    for (const c of cards.slice(0, 3)) await give(a, c);
    const id = await createShowcaseWith(prisma, a, { ...blank, layout: "DUO" }, 6);
    expect(await addShowcaseCardsWith(prisma, a, id, [cards[0], cards[1]])).toEqual([cards[0], cards[1]]);
    expect(await code(addShowcaseCardsWith(prisma, a, id, [cards[2]]))).toBe("FULL");
    expect(await removeShowcaseCardWith(prisma, a, id, cards[0])).toEqual([null, cards[1]]);
  }, 60_000);

  it("ne touche jamais à la vitrine d'un autre joueur", async () => {
    const [a, b] = [await player(), await player()];
    const id = await createShowcaseWith(prisma, a, { ...blank, layout: "SOLO" }, 6);
    expect(await code(updateShowcaseWith(prisma, b, id, { name: "à moi" }))).toBe("NOT_FOUND");
    expect(await code(deleteShowcaseWith(prisma, b, id))).toBe("NOT_FOUND");
    expect(await code(setShowcaseCardsWith(prisma, b, id, []))).toBe("NOT_FOUND");
  }, 60_000);

  it("réordonne, et renumérote après une suppression", async () => {
    const a = await player();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await createShowcaseWith(prisma, a, { ...blank, layout: "SOLO" }, 6));
    await reorderShowcasesWith(prisma, a, [ids[2], ids[0], ids[1]]);
    expect(await code(reorderShowcasesWith(prisma, a, [ids[0], ids[1]]))).toBe("INVALID");
    await deleteShowcaseWith(prisma, a, ids[2]);
    const rows = await prisma.showcase.findMany({ where: { userId: a }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
    expect(rows).toEqual([{ id: ids[0], sortOrder: 0 }, { id: ids[1], sortOrder: 1 }]);
  }, 60_000);
});
