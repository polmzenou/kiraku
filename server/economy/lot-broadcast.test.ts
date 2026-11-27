import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { LotDeps } from "./lots";

// Envoi à tous, sans base : le paquet de joueurs est lu avant chaque versement, l'éligibilité revue sous le verrou.
const m = vi.hoisted(() => ({ lock: vi.fn(), grant: vi.fn(), notify: vi.fn(), log: vi.fn() }));
vi.mock("../social/lock", () => ({ lockPlayers: m.lock }));
vi.mock("./lots", () => ({ grantLot: m.grant, LotError: class extends Error {} }));
vi.mock("../admin/log", () => ({ writeAdminLog: m.log }));
vi.mock("../social/notify", () => ({
  notify: m.notify,
  notifyingTransaction: (db: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }, fn: (tx: unknown) => Promise<unknown>) =>
    db.$transaction(fn),
}));
import { runLotBroadcastWith } from "./lot-grant-core";

const deps: LotDeps = { rng: () => 0, loadPool: vi.fn() };
const broadcast = { id: "b1", lotId: "lot", adminId: "admin", audience: "ALL", status: "RUNNING", lastUserId: null, granted: 0 };

const findBatch = vi.fn();
const eligibleCount = vi.fn();
const createGrant = vi.fn();
const updateBroadcast = vi.fn();
const db = {
  lotBroadcast: {
    findUnique: vi.fn(async () => broadcast),
    findUniqueOrThrow: vi.fn(async () => ({ granted: 1 })),
    update: updateBroadcast,
  },
  user: { findMany: findBatch, count: eligibleCount },
  lotGrant: { create: createGrant },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
} as unknown as PrismaClient;

beforeEach(() => {
  vi.clearAllMocks();
  // Un seul paquet : un invité purgé depuis, un joueur banni depuis, un joueur servi
  findBatch.mockResolvedValueOnce([{ id: "gone" }, { id: "banned" }, { id: "ok" }]).mockResolvedValue([]);
  m.lock.mockImplementation(async (_tx: unknown, [id]: string[]) => new Map(id === "gone" ? [] : [[id, { id }]]));
  eligibleCount.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "banned" ? 0 : 1));
  m.grant.mockResolvedValue({ zeni: 10, boosters: [], cards: [] });
});

describe("envoi d'un lot à tous", () => {
  it("saute un joueur supprimé ou devenu inéligible depuis la lecture du paquet, sans arrêter l'envoi", async () => {
    const result = await runLotBroadcastWith(db, { broadcastId: "b1", now: new Date(), budgetMs: 10_000 }, deps);
    expect(result.done).toBe(true);
    expect(createGrant).toHaveBeenCalledOnce();
    expect(createGrant).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "ok", broadcastId: "b1" }) });
    expect(m.grant).toHaveBeenCalledOnce();
    expect(m.grant.mock.calls[0][1]).toBe("ok");
    // Le curseur avance aussi sur les joueurs sautés : une reprise ne les relit pas
    for (const userId of ["gone", "banned", "ok"]) {
      expect(updateBroadcast).toHaveBeenCalledWith({ where: { id: "b1" }, data: expect.objectContaining({ lastUserId: userId }) });
    }
  });
});
