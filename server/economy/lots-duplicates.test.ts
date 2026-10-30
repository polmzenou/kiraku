import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import type { CardPool, DuplicateGuard } from "@/lib/boosters/draw";
import { seededRng } from "@/lib/boosters/rng";
import { loadOwnedCopies } from "../boosters/duplicate-guard";
import { grantLot, type LotDeps } from "./lots";

// Lots « une carte au hasard d'une rareté » et doublons des grandes raretés : client transactionnel factice.

const GUARD: DuplicateGuard = { rarities: ["MYTHIC", "AR", "GOLD"], divisor: 1_000_000, blockAt: 2 };
const pool: CardPool = { COMMON: ["c"], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: ["l1", "l2"], MYTHIC: ["x", "y"] };

function fakeTx(owned: Record<string, number>, items: { kind: string; rarity?: string; cardId?: string; quantity: number }[]) {
  const created: string[] = [];
  const tx = {
    lot: { findUnique: async () => ({ zeni: 0, items: items.map((i) => ({ boosterTypeId: null, cardId: null, rarity: null, ...i })) }) },
    card: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, rarity: "MYTHIC" }) },
    userCard: {
      groupBy: vi.fn(async () => Object.entries(owned).map(([cardId, n]) => ({ cardId, _count: { _all: n } }))),
      createMany: async ({ data }: { data: { cardId: string }[] }) => void created.push(...data.map((d) => d.cardId)),
    },
    discovery: { findMany: async () => [], createMany: async () => ({ count: 0 }) },
    wishlistEntry: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, created, groupBy: tx.userCard.groupBy };
}
const deps = (guard: DuplicateGuard | undefined, seed = 1): LotDeps => ({ rng: seededRng(seed), loadPool: async () => pool, duplicateGuard: async () => guard });
const grant = (tx: Prisma.TransactionClient, d: LotDeps) => grantLot(tx, "joueur", "lot", { reason: "MISSION", refId: "m1" }, d);

describe("lots et doublons des grandes raretés", () => {
  it("compte les exemplaires des raretés protégées du joueur, en une requête groupée", async () => {
    const { tx, groupBy } = fakeTx({ x: 2, y: 1 }, []);
    expect(await loadOwnedCopies(tx, "joueur", GUARD)).toEqual(new Map([["x", 2], ["y", 1]]));
    expect(groupBy).toHaveBeenCalledWith({ by: ["cardId"], where: { ownerId: "joueur", card: { rarity: { in: ["MYTHIC", "AR", "GOLD"] } } }, _count: { _all: true } });
    expect(await loadOwnedCopies(tx, "joueur", undefined)).toEqual(new Map());
    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it("une Mythique au hasard évite celle que le joueur a en double", async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { tx, created } = fakeTx({ x: 2 }, [{ kind: "RARITY", rarity: "MYTHIC", quantity: 1 }]);
      await grant(tx, deps(GUARD, seed));
      expect(created).toEqual(["y"]);
    }
  });

  it("deux Mythiques au hasard ne donnent jamais deux fois la même, ni une carte déjà versée par le lot", async () => {
    const { tx, created } = fakeTx({}, [{ kind: "CARD", cardId: "x", quantity: 1 }, { kind: "RARITY", rarity: "MYTHIC", quantity: 2 }]);
    await grant(tx, deps(GUARD));
    // x versée d'office, y tirée, puis plus aucune Mythique libre : une Légendaire
    expect(created.slice(0, 2)).toEqual(["x", "y"]);
    expect(created[2]).toMatch(/^l[12]$/);
  });

  it("sans règle, le tirage d'un lot reste celui d'avant", async () => {
    const { tx, created, groupBy } = fakeTx({ x: 2 }, [{ kind: "RARITY", rarity: "MYTHIC", quantity: 5 }]);
    await grant(tx, deps(undefined, 4));
    expect(created).toHaveLength(5);
    expect(created.every((id) => id === "x" || id === "y")).toBe(true);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
