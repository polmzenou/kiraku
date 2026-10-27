import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { focusCards, upsertBoosterSeeds } from "./type-store";
import { featuredFromPool, groupByRarity } from "@/lib/boosters/draw";

describe("seed ciblé de booster", () => {
  it("ajoute Antagonistes dans Par personnage sans réécrire les autres types", async () => {
    const boosterType = { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() };
    const result = await upsertBoosterSeeds({ boosterType } as unknown as PrismaClient, BOOSTER_SEEDS, { slugs: ["antagonistes"] });
    expect(result.created).toEqual(["antagonistes"]);
    expect(boosterType.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ slug: "antagonistes", family: "personnage", sortOrder: 3 }) });
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
