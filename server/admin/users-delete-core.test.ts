import type { PrismaClient } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { deleteUserWith } from "./users-delete-core";

type Auction = { id: string; sellerId: string; cardId: string; startPrice: number; currentBid: number | null; currentBidderId: string | null };

function setup({
  actorRole = "ADMIN",
  targetRole = "USER",
  adminHistory = 0,
  auctions = [] as Auction[],
  battles = [] as { p1Id: string; p2Id: string | null; p1Team: string[]; p2Team: string[] }[],
} = {}) {
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "Auction"')) return auctions;
      if (sql.includes('UPDATE "User" SET coins')) return [{ coins: 100 + Number(values[0]) }];
      return [];
    }),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "admin"
          ? { role: actorRole, bannedAt: null }
          : {
              id: "target",
              username: "Target",
              email: null,
              role: targetRole,
              isGuest: false,
              coins: 40,
              createdAt: new Date(0),
              _count: { cards: 3, adminLogs: adminHistory, lotGrantsGiven: 0, lotBroadcasts: 0 },
            },
      ),
      delete: vi.fn(),
    },
    auction: { update: vi.fn(), updateMany: vi.fn() },
    battle: { findMany: vi.fn().mockResolvedValue(battles) },
    userCard: { updateMany: vi.fn() },
    coinTransaction: { createMany: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({ id: "n1" }) },
    adminLog: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } as unknown as PrismaClient;
  return { tx, db };
}

const input = { adminId: "admin", userId: "target", reason: "Spam" };

describe("suppression définitive d'un compte", () => {
  it("refuse de se supprimer soi-même, sans transaction", async () => {
    const { db } = setup();
    await expect(deleteUserWith(db, { ...input, userId: "admin" })).rejects.toMatchObject({ code: "SELF_PROTECTED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ actorRole: "USER" }, "FORBIDDEN"],
    [{ targetRole: "ADMIN" }, "ADMIN_PROTECTED"],
    [{ adminHistory: 2 }, "HAS_ADMIN_HISTORY"],
  ])("refuse sans rien supprimer (%o)", async (state, code) => {
    const { tx, db } = setup(state);
    await expect(deleteUserWith(db, input)).rejects.toMatchObject({ code });
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
  });

  it("annule ses ventes en rendant la mise, remet sans meneur celles qu'il menait, puis supprime", async () => {
    const { tx, db } = setup({
      auctions: [
        { id: "a1", sellerId: "target", cardId: "c1", startPrice: 10, currentBid: 50, currentBidderId: "bidder" },
        { id: "a2", sellerId: "other", cardId: "c2", startPrice: 20, currentBid: 30, currentBidderId: "target" },
      ],
    });
    await deleteUserWith(db, input);

    expect(tx.auction.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: expect.objectContaining({ status: "CANCELLED" }) });
    const refund = tx.coinTransaction.createMany.mock.calls[0][0].data;
    expect(refund).toEqual([expect.objectContaining({ userId: "bidder", amount: 50, reason: "BID_REFUND", refId: "a1" })]);
    expect(tx.auction.update).toHaveBeenCalledWith({ where: { id: "a2" }, data: { currentBid: null, currentBidderId: null, price: 20 } });
    expect(tx.adminLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_DELETE", targetId: "target" }) });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "target" }, select: { id: true } });
  });

  it("rend à l'adversaire les cartes engagées dans un combat en cours", async () => {
    const { tx, db } = setup({ battles: [{ p1Id: "target", p2Id: "rival", p1Team: ["t1"], p2Team: ["r1", "r2"] }] });
    await deleteUserWith(db, input);
    expect(tx.userCard.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1", "r2"] }, ownerId: "rival", status: "BATTLE" },
      data: { status: "COLLECTION" },
    });
  });
});
