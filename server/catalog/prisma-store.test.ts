import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { rawCharacter } from "@/lib/catalog/fixtures";
import { normalizeCharacter } from "@/lib/catalog/anilist";
import type { CatalogSnapshotRow, FinalEntry } from "./import";
import { prismaImportStore } from "./prisma-store";

function entry(anilistId: number, rank: number): FinalEntry {
  const normalized = normalizeCharacter(rawCharacter({ id: anilistId }), 60);
  if (!normalized.ok) throw new Error("Invalid fixture");
  return { anilistId, rank, position: rank, favorites: 100, rarity: "COMMON", power: 40, ki: 30, data: normalized.character };
}

function database(before: CatalogSnapshotRow[]) {
  const transaction = {
    card: { findMany: vi.fn().mockResolvedValue(before) },
    catalogImport: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    gameSetting: { upsert: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const client = {
    $transaction: vi.fn(async (callback: (value: typeof transaction) => Promise<void>) => callback(transaction)),
    catalogImportRow: { deleteMany: vi.fn() },
  };
  return { transaction, client, store: prismaImportStore(client as unknown as PrismaClient) };
}

describe("publication protégée de l'import Prisma", () => {
  it("verrouille le catalogue et exclut toute carte existante des insertions", async () => {
    const { store, transaction } = database([{ anilistId: 1, rank: 1, rarity: "MYTHIC", power: 99, ki: 83 }]);
    const incoming = [entry(1, 1), entry(2, 2)];
    await store.finalize("run", incoming, { preserveExisting: true });
    expect(transaction.$executeRaw.mock.calls[0][0].join("")).toContain('LOCK TABLE "Card" IN SHARE ROW EXCLUSIVE MODE');
    const insert = transaction.$executeRaw.mock.calls.find(([query]) => query.join("").includes('INSERT INTO "Card"'))!;
    const payload = JSON.parse(insert[2]);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ anilistId: 2, rank: 2, rarity: "COMMON", power: 40, ki: 30 });
    expect(insert[3]).toBe(true);
    expect(transaction.$executeRaw.mock.calls.some(([query]) => query.join("").includes('UPDATE "Card" SET "rank" = NULL'))).toBe(false);
    const series = transaction.$executeRaw.mock.calls.find(([query]) => query.join("").includes('INSERT INTO "Series"'))!;
    expect(series[2]).toBe(true);
    expect(incoming[0]).toMatchObject({ rarity: "COMMON", power: 40, ki: 30 });
    expect(transaction.gameSetting.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { key: "catalog.size" },
      create: { key: "catalog.size", value: 2 },
      update: { value: 2 },
    });
  });

  it("conserve les cartes absentes de l'import et poursuit leur numérotation", async () => {
    const { store, transaction, client } = database([{ anilistId: 3, rank: 1, rarity: "RARE", power: 70, ki: 45 }]);
    await store.finalize("run", [entry(1, 1)], { preserveExisting: true });
    const insert = transaction.$executeRaw.mock.calls.find(([query]) => query.join("").includes('INSERT INTO "Card"'))!;
    expect(JSON.parse(insert[2])).toMatchObject([{ anilistId: 1, rank: 2 }]);
    expect(client.catalogImportRow.deleteMany).toHaveBeenCalled();
  });

  it("conserve le comportement de rééquilibrage d'un import habituel", async () => {
    const { store, transaction } = database([{ anilistId: 1, rank: 1, rarity: "MYTHIC", power: 99, ki: 83 }]);
    await store.finalize("run", [entry(1, 1)]);
    expect(transaction.card.findMany).not.toHaveBeenCalled();
    expect(transaction.gameSetting.upsert).not.toHaveBeenCalled();
    const insert = transaction.$executeRaw.mock.calls.find(([query]) => query.join("").includes('INSERT INTO "Card"'))!;
    expect(JSON.parse(insert[2])[0]).toMatchObject({ rarity: "COMMON", power: 40, ki: 30 });
  });

  it("ne réactive pas une ancienne carte et respecte l'objectif même si le catalogue a grandi", async () => {
    const { store, transaction } = database([
      { anilistId: 1, rank: null, rarity: "MYTHIC", power: 99, ki: 83 },
      { anilistId: 2, rank: 1, rarity: "RARE", power: 70, ki: 50 },
      { anilistId: 3, rank: 2, rarity: "COMMON", power: 40, ki: 30 },
    ]);
    await store.finalize("run", [entry(1, 1), entry(4, 2)], { preserveExisting: true, target: 2 });
    expect(transaction.$executeRaw.mock.calls.some(([query]) => query.join("").includes('INSERT INTO "Card"'))).toBe(false);
    expect(transaction.gameSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: 2 } }));
  });
});
