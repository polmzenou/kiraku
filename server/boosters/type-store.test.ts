import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { upsertBoosterSeeds } from "./type-store";

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
