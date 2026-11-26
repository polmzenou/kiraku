import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { computePoolCards, focusCards, upsertBoosterSeeds } from "./type-store";
import { filterContext, type PoolCandidate } from "@/lib/boosters/pool-filter";
import { featuredFromPool, groupByRarity } from "@/lib/boosters/draw";
import { stillDrawable } from "@/lib/boosters/drawable";
import { includesCustomByDefault } from "@/lib/boosters/types";

describe("seed ciblé de booster", () => {
  it("ajoute Antagonistes dans Par personnage sans réécrire les autres types", async () => {
    const boosterType = { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() };
    const result = await upsertBoosterSeeds({ boosterType } as unknown as PrismaClient, BOOSTER_SEEDS, { slugs: ["antagonistes"] });
    expect(result.created).toEqual(["antagonistes"]);
    expect(boosterType.create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ slug: "antagonistes", family: "personnage", sortOrder: 3 }),
      select: { id: true },
    });
    expect(boosterType.update).not.toHaveBeenCalled();
  });

  it("préserve une sélection Antagonistes déjà personnalisée dans l'admin", async () => {
    const boosterType = { findMany: vi.fn().mockResolvedValue([{ slug: "antagonistes" }]), create: vi.fn(), update: vi.fn() };
    const result = await upsertBoosterSeeds({ boosterType } as unknown as PrismaClient, BOOSTER_SEEDS, { slugs: ["antagonistes"] });
    expect(result.kept).toEqual(["antagonistes"]);
    expect(boosterType.create).not.toHaveBeenCalled();
    expect(boosterType.update).not.toHaveBeenCalled();
  });
});

describe("Focus série", () => {
  const cards = [
    { id: "gojo", rarity: "MYTHIC", seriesAnilistId: 113415 },
    { id: "denji", rarity: "EPIC", seriesAnilistId: 127230 },
    { id: "luffy", rarity: "EPIC", seriesAnilistId: 21 },
    { id: "itadori", rarity: "COMMON", seriesAnilistId: 113415 },
    { id: "sans-serie", rarity: "COMMON", seriesAnilistId: null },
  ];

  it("garde les cartes du pool des œuvres mises en avant, dans l'ordre du pool", () => {
    expect(focusCards(cards, [113415])).toEqual(["gojo", "itadori"]);
    expect(focusCards(cards, [113415, 127230])).toEqual(["gojo", "denji", "itadori"]);
    expect(focusCards(cards, [])).toEqual([]);
  });

  it("les cartes focus deviennent les vedettes du tirage, rangées par rareté", () => {
    const pool = groupByRarity(cards.map((c) => ({ id: c.id, rarity: c.rarity })));
    const featured = featuredFromPool(focusCards(cards, [113415]), pool, { rate: 4000, pityThreshold: 30 })!;
    expect(featured.byRarity.MYTHIC).toEqual(["gojo"]);
    expect(featured.byRarity.COMMON).toEqual(["itadori"]);
    expect(featured.byRarity.EPIC).toEqual([]);
    expect(featured.rate).toBe(4000);
  });
});

describe("variantes dans les pools", () => {
  const ctx = filterContext(new Date("2026-10-27T10:00:00Z"), "Europe/Paris");
  const card = (id: string, extra: Partial<PoolCandidate> = {}): PoolCandidate => ({
    id, anilistId: null, rarity: "MYTHIC", gender: "Female", role: "MAIN", birthMonth: null, birthDay: null,
    seriesAnilistId: 127230, mediaType: "ANIME", genres: [], tags: [], year: 2022, season: null, seasonYear: null, studio: null,
    origin: "ANILIST", ...extra,
  });
  const makima = card("makima");
  const denji = card("denji", { gender: "Male" });
  const ar = card("makima-ar", { rarity: "AR", origin: "CUSTOM", variantOfId: "makima", gender: null, role: null });
  const gold = card("makima-gold", { rarity: "GOLD", origin: "CUSTOM", variantOfId: "makima", boosterExclusive: true, boosterIds: ["event"] });
  const all = [makima, denji, ar, gold];
  const ids = (type: Parameters<typeof computePoolCards>[0]) => computePoolCards(type, all, ctx).map((c) => c.id);

  it("une variante suit sa carte de base, même sans être cochée ni remplir le filtre", () => {
    expect(ids({ id: "focus-csm", filter: { seriesIds: [127230] }, featuredCardIds: [], includeCustom: false })).toEqual(["makima", "denji", "makima-ar"]);
    expect(ids({ id: "waifus", filter: { gender: "Female" }, featuredCardIds: [], includeCustom: false })).toEqual(["makima", "makima-ar"]);
    expect(ids({ id: "husbandos", filter: { gender: "Male" }, featuredCardIds: [], includeCustom: false })).toEqual(["denji"]);
  });

  it("une variante exclusive ne sort que des boosters cochés", () => {
    expect(ids({ id: "divin", filter: {}, featuredCardIds: [], includeCustom: false })).not.toContain("makima-gold");
    expect(ids({ id: "event", filter: { seriesIds: [1] }, featuredCardIds: [], includeCustom: false })).toEqual(["makima-gold"]);
  });

  it("ne prend jamais d'office une variante exclusive, même avec les créations incluses", () => {
    expect(ids({ id: "auto", filter: {}, featuredCardIds: [], includeCustom: true })).not.toContain("makima-gold");
  });

  // Régression : une AR qui suivait sa base entrait au pool, mais l'ouverture la refusait (NOT_FOR_SALE)
  it("toute carte d'un pool calculé passe la revérification de l'ouverture", () => {
    const types = [
      { id: "focus-csm", filter: { seriesIds: [127230] }, featuredCardIds: [], includeCustom: false },
      { id: "waifus", filter: { gender: "Female" as const }, featuredCardIds: [], includeCustom: false },
      { id: "event", filter: { seriesIds: [1] }, featuredCardIds: [], includeCustom: false },
      { id: "auto", filter: {}, featuredCardIds: [], includeCustom: true },
      { id: "auto-csm", filter: { seriesIds: [127230] }, featuredCardIds: [], includeCustom: true },
    ];
    for (const type of types) {
      const cards = computePoolCards(type, all, ctx);
      const inPool = new Set(cards.map((c) => c.id));
      for (const c of cards) {
        const row = { id: c.id, status: "PUBLISHED", rarity: c.rarity, dropWeight: 1, origin: c.origin ?? "ANILIST", boosterIds: c.boosterIds ?? [], variantOfId: c.variantOfId ?? null, boosterExclusive: c.boosterExclusive ?? false };
        expect(stillDrawable(row, { rarity: c.rarity, weight: 1 }, { typeId: type.id, includeCustom: type.includeCustom, inPool: (id) => inPool.has(id) }), `${c.id} dans ${type.id}`).toBe(true);
      }
    }
  });
});

describe("créations originales incluses d'office", () => {
  const ctx = filterContext(new Date("2026-10-27T10:00:00Z"), "Europe/Paris");
  const card = (id: string, extra: Partial<PoolCandidate> = {}): PoolCandidate => ({
    id, anilistId: null, rarity: "EPIC", gender: "Female", role: "MAIN", birthMonth: null, birthDay: null,
    seriesAnilistId: 127230, mediaType: "ANIME", genres: [], tags: [], year: 2022, season: null, seasonYear: null, studio: null,
    origin: "ANILIST", ...extra,
  });
  const makima = card("makima");
  const reze = card("reze-creation", { origin: "CUSTOM", boosterIds: [] });
  const luffy = card("luffy-creation", { origin: "CUSTOM", seriesAnilistId: 21, gender: "Male", boosterIds: ["husbandos"] });
  const all = [makima, reze, luffy];
  const ids = (type: Parameters<typeof computePoolCards>[0]) => computePoolCards(type, all, ctx).map((c) => c.id);

  it("une nouvelle création entre dans tout booster dont elle passe le filtre, sans être cochée", () => {
    expect(ids({ id: "standard", filter: {}, featuredCardIds: [], includeCustom: true })).toEqual(["makima", "reze-creation", "luffy-creation"]);
    expect(ids({ id: "focus-csm", filter: { seriesIds: [127230] }, featuredCardIds: [], includeCustom: true })).toEqual(["makima", "reze-creation"]);
  });

  it("une création cochée reste dans son booster même hors filtre, sans doublon", () => {
    expect(ids({ id: "husbandos", filter: { seriesIds: [127230] }, featuredCardIds: [], includeCustom: true })).toEqual(["makima", "reze-creation", "luffy-creation"]);
    expect(ids({ id: "husbandos", filter: {}, featuredCardIds: [], includeCustom: true })).toEqual(["makima", "reze-creation", "luffy-creation"]);
  });

  it("sans l'option, seules les créations cochées entrent", () => {
    expect(ids({ id: "standard", filter: {}, featuredCardIds: [], includeCustom: false })).toEqual(["makima"]);
    expect(ids({ id: "husbandos", filter: {}, featuredCardIds: [], includeCustom: false })).toEqual(["makima", "luffy-creation"]);
  });

  it("une vedette créée à la main suit la même règle", () => {
    const outside = card("vedette", { origin: "CUSTOM", seriesAnilistId: 1 });
    const pool = (includeCustom: boolean) => computePoolCards({ id: "banniere", filter: { seriesIds: [127230] }, featuredCardIds: ["vedette"], includeCustom }, [makima, outside], ctx).map((c) => c.id);
    expect(pool(true)).toEqual(["makima", "vedette"]);
    expect(pool(false)).toEqual(["makima"]);
  });

  it("les sachets scellés et les exclusifs boutique ne prennent pas les créations d'office", () => {
    expect(includesCustomByDefault("STANDARD")).toBe(true);
    expect(includesCustomByDefault("FOCUS")).toBe(true);
    expect(includesCustomByDefault("DROP")).toBe(false);
    expect(includesCustomByDefault("PRESTIGE")).toBe(false);
  });
});
