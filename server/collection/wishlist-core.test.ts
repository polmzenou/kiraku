import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { consumeWishlist, setWishlistWith } from "./wishlist-core";

function setup({ entries = [], banned = false, exists = true, rank = 1 as number | null, owned = 0 }: {
  entries?: { cardId: string; position: number }[]; banned?: boolean; exists?: boolean; rank?: number | null; owned?: number;
} = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(exists ? [{ bannedAt: banned ? new Date() : null }] : []),
    wishlistEntry: {
      findMany: vi.fn().mockResolvedValue(entries), create: vi.fn(), deleteMany: vi.fn(),
    },
    card: { findUnique: vi.fn().mockResolvedValue({ status: rank === null ? "ARCHIVED" : "PUBLISHED" }) },
    userCard: { count: vi.fn().mockResolvedValue(owned) },
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

  it("accepte une carte personnalisée publiée sans rang AniList", async () => {
    const { tx, db } = setup({ rank: null });
    tx.card.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    await expect(setWishlistWith(db, "viewer", "custom", true)).resolves.toBe(true);
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

  it("refuse une carte déjà possédée, quel que soit l'état de l'exemplaire", async () => {
    const { tx, db } = setup({ owned: 1 });
    await expect(setWishlistWith(db, "viewer", "mine", true)).rejects.toMatchObject({ code: "OWNED" });
    expect(tx.userCard.count).toHaveBeenCalledWith({ where: { ownerId: "viewer", cardId: "mine" } });
    expect(tx.wishlistEntry.create).not.toHaveBeenCalled();
  });

  it("une carte possédée encore dans la liste peut toujours en être retirée", async () => {
    const { tx, db } = setup({ owned: 2 });
    await expect(setWishlistWith(db, "viewer", "mine", false)).resolves.toBe(false);
    expect(tx.wishlistEntry.deleteMany).toHaveBeenCalled();
  });
});

describe("consumeWishlist", () => {
  function txWith(entries: { cardId: string }[]) {
    return {
      wishlistEntry: { findMany: vi.fn().mockResolvedValue(entries), deleteMany: vi.fn() },
    };
  }

  it("retire les cartes obtenues qui étaient souhaitées et les renvoie", async () => {
    const tx = txWith([{ cardId: "b" }]);
    const wished = await consumeWishlist(tx as unknown as Prisma.TransactionClient, "u", ["a", "b", "b"]);
    expect([...wished]).toEqual(["b"]);
    expect(tx.wishlistEntry.findMany).toHaveBeenCalledWith({ where: { userId: "u", cardId: { in: ["a", "b"] } }, select: { cardId: true } });
    expect(tx.wishlistEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: "u", cardId: { in: ["b"] } } });
  });

  it("ne touche à rien quand aucune carte n'était souhaitée", async () => {
    const tx = txWith([]);
    expect((await consumeWishlist(tx as unknown as Prisma.TransactionClient, "u", ["a"])).size).toBe(0);
    expect(tx.wishlistEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("ne lit rien pour un versement vide", async () => {
    const tx = txWith([]);
    await consumeWishlist(tx as unknown as Prisma.TransactionClient, "u", []);
    expect(tx.wishlistEntry.findMany).not.toHaveBeenCalled();
  });
});
