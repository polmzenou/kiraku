import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { setWishlistWith } from "./wishlist-core";

function setup({ entries = [], banned = false, exists = true, rank = 1 as number | null }: {
  entries?: { cardId: string; position: number }[]; banned?: boolean; exists?: boolean; rank?: number | null;
} = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(exists ? [{ bannedAt: banned ? new Date() : null }] : []),
    wishlistEntry: {
      findMany: vi.fn().mockResolvedValue(entries), create: vi.fn(), deleteMany: vi.fn(),
    },
    card: { findUnique: vi.fn().mockResolvedValue({ rank }) },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaClient;
  return { tx, db };
}

describe("liste de souhaits", () => {
  it("accepte une carte du catalogue sans aucun exemplaire possédé", async () => {
    const { tx, db } = setup();
    await expect(setWishlistWith(db, "viewer", "unowned", true)).resolves.toBe(true);
    expect(tx.wishlistEntry.create).toHaveBeenCalledWith({ data: { userId: "viewer", cardId: "unowned", position: 1 } });
  });

  it("refuse une 21e carte et conserve les vingt autres", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ cardId: `card-${i}`, position: i + 1 }));
    const { tx, db } = setup({ entries });
    await expect(setWishlistWith(db, "viewer", "another", true)).rejects.toMatchObject({ code: "FULL" });
    expect(tx.wishlistEntry.create).not.toHaveBeenCalled();
    expect(tx.wishlistEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("un ajout répété reste idempotent, même quand la liste est pleine", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ cardId: `card-${i}`, position: i + 1 }));
    const { tx, db } = setup({ entries });
    await expect(setWishlistWith(db, "viewer", "card-1", true)).resolves.toBe(true);
    expect(tx.wishlistEntry.create).not.toHaveBeenCalled();
  });

  it("réutilise une case libérée sans remplacer les autres cartes", async () => {
    const { tx, db } = setup({ entries: [{ cardId: "first", position: 1 }, { cardId: "third", position: 3 }] });
    await setWishlistWith(db, "viewer", "second", true);
    expect(tx.wishlistEntry.create).toHaveBeenCalledWith({ data: { userId: "viewer", cardId: "second", position: 2 } });
  });

  it("un retrait ne touche que la liste du joueur et fonctionne pour une carte sortie du catalogue", async () => {
    const { tx, db } = setup({ rank: null });
    await expect(setWishlistWith(db, "viewer", "retired", false)).resolves.toBe(false);
    expect(tx.wishlistEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: "viewer", cardId: "retired" } });
    expect(tx.card.findUnique).not.toHaveBeenCalled();
  });

  it.each([{ banned: true, code: "BANNED" }, { exists: false, code: "NO_USER" }])("revérifie les droits sous verrou : $code", async ({ code, ...options }) => {
    const { tx, db } = setup(options);
    await expect(setWishlistWith(db, "viewer", "card", true)).rejects.toMatchObject({ code });
    expect(tx.wishlistEntry.create).not.toHaveBeenCalled();
    expect(tx.wishlistEntry.deleteMany).not.toHaveBeenCalled();
  });

  it.each([null, "missing"])("refuse une carte absente ou retirée : %s", async (kind) => {
    const { tx, db } = setup({ rank: null });
    if (kind === "missing") tx.card.findUnique.mockResolvedValue(null);
    await expect(setWishlistWith(db, "viewer", "invalid", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tx.wishlistEntry.create).not.toHaveBeenCalled();
  });
});
