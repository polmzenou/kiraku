import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("../db", () => ({ prisma: {} }));
const { assembleNewsVisuals, readNewsVisuals } = await import("./news");

const NOW = new Date("2026-11-01T12:00:00.000Z");
const card = (id: string) => ({ id, name: id, nameNative: null, imageUrl: `https://s4.anilist.co/${id}.png`, rank: 1, rarity: "MYTHIC", power: 90, ki: 80, appearance: {}, formName: null });
const imperial = {
  slug: "imperial",
  name: { fr: "Impérial", en: "Imperial" },
  emblem: "皇",
  shape: "JUBAKO",
  theme: { base: "#1E3557", dark: "#0B1424", pattern: "kikko", ink: "light" },
  endsAt: new Date("2026-11-06T22:00:00.000Z"),
  featuredCardIds: ["f1", "f2", "f3", "f4"],
};

function fakeDb(cards = [card("a"), card("b"), card("f1"), card("f2")], types = [imperial]) {
  const db = {
    card: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => cards.filter((c) => where.id.in.includes(c.id))) },
    boosterType: { findMany: vi.fn(async ({ where }: { where: { slug: { in: string[] } } }) => types.filter((t) => where.slug.in.includes(t.slug))) },
  };
  return db as typeof db & Pick<PrismaClient, "card" | "boosterType">;
}

describe("visuels des bannières Nouveautés", () => {
  it("lit les boosters actifs puis toutes les cartes publiées en une requête, vedettes comprises", async () => {
    const db = fakeDb();
    const loaded = await readNewsVisuals(db, ["a", "b"], ["imperial"], "en", NOW);
    expect(db.boosterType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: { in: ["imperial"] }, active: true, OR: [{ endsAt: null }, { endsAt: { gt: NOW } }] } }));
    expect(db.card.findMany).toHaveBeenCalledTimes(1);
    expect(db.card.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["a", "b", "f1", "f2", "f3"] }, status: "PUBLISHED" } });
    expect(loaded.boosters[0]).toMatchObject({ slug: "imperial", name: "Imperial", emblem: "皇", shape: "JUBAKO", endsAt: "2026-11-06T22:00:00.000Z", featured: ["f1", "f2", "f3"] });
    expect(loaded.boosters[0].theme).toMatchObject({ base: "#1E3557", pattern: "kikko" });
  });

  it("ne lit rien sans carte ni booster à montrer", async () => {
    const db = fakeDb();
    expect(await readNewsVisuals(db, [], [], "fr", NOW)).toEqual({ cards: [], boosters: [] });
    expect(db.card.findMany).not.toHaveBeenCalled();
    expect(db.boosterType.findMany).not.toHaveBeenCalled();
  });

  it("garde l'ordre de l'admin, saute les cartes retirées et les boosters éteints", async () => {
    const loaded = await readNewsVisuals(fakeDb(), ["b", "gone", "a"], ["imperial", "ancien"], "fr", NOW);
    const visuals = assembleNewsVisuals(
      [
        { id: "cartes", visual: { kind: "cards", cardIds: ["b", "gone", "a"] } },
        { id: "perdues", visual: { kind: "cards", cardIds: ["gone"] } },
        { id: "booster", visual: { kind: "booster", slug: "imperial" } },
        { id: "eteint", visual: { kind: "booster", slug: "ancien" } },
        { id: "texte", visual: { kind: "none" } },
      ],
      loaded,
    );
    expect(Object.keys(visuals)).toEqual(["cartes", "booster"]);
    expect(visuals.cartes).toEqual({ kind: "cards", cards: [card("b"), card("a")] });
    const booster = visuals.booster;
    expect(booster.kind === "booster" && booster.booster.name).toBe("Impérial");
    expect(booster.kind === "booster" && booster.cards.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(booster.kind === "booster" && "featured" in booster.booster).toBe(false);
  });
});
