import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ logs: vi.fn(), users: vi.fn() }));
vi.mock("../db", () => ({ prisma: { adminLog: { findMany: mocks.logs }, user: { findMany: mocks.users } } }));

import { listAdminLogs } from "./logs";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logs.mockResolvedValue([]);
  mocks.users.mockResolvedValue([{ id: "admin-a" }, { id: "admin-b" }]);
});

const whereOf = () => mocks.logs.mock.calls[0][0].where;

describe("journal de l'équipe", () => {
  it("cache au DEV les modifications faites sur le compte d'un administrateur, comme sa fiche", async () => {
    await listAdminLogs({ type: "User" }, { timeZone: "UTC", hideAdminTargets: true });
    expect(mocks.users).toHaveBeenCalledWith({ where: { role: "ADMIN" }, select: { id: true } });
    // Les autres cibles et les lignes sans cible restent visibles
    expect(whereOf()).toEqual({
      targetType: "User",
      OR: [{ targetType: { not: "User" } }, { targetId: null }, { targetId: { notIn: ["admin-a", "admin-b"] } }],
    });
  });

  it("montre tout à l'admin, sans lire l'équipe", async () => {
    await listAdminLogs({}, { timeZone: "UTC", hideAdminTargets: false });
    expect(mocks.users).not.toHaveBeenCalled();
    expect(whereOf()).toEqual({});
  });

  it("borne les dates dans le fuseau des heures affichées", async () => {
    await listAdminLogs({ from: "2026-11-27", to: "2026-11-27" }, { timeZone: "Europe/Paris", hideAdminTargets: false });
    expect(whereOf()).toEqual({ createdAt: { gte: new Date("2026-11-26T23:00:00Z"), lt: new Date("2026-11-27T23:00:00Z") } });
  });

  it("pagine par curseur : une ligne de plus pour savoir s'il y a une suite", async () => {
    mocks.logs.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: `l${i}` })));
    const page = await listAdminLogs({ cursor: "l0" }, { timeZone: "UTC", hideAdminTargets: false });
    expect(mocks.logs.mock.calls[0][0]).toMatchObject({ take: 51, cursor: { id: "l0" }, skip: 1 });
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("l49");
  });
});
