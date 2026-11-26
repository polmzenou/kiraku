import { beforeEach, describe, expect, it, vi } from "vitest";

// Frontière des actions de bans réseau : rôle, Zod, limitation, puis le cœur (simulé ici) avec les réglages lus.

const mocks = vi.hoisted(() => ({ getAdmin: vi.fn(), limit: vi.fn(), refresh: vi.fn(), getSetting: vi.fn(), ban: vi.fn(), group: vi.fn(), lift: vi.fn(), keep: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.getAdmin }));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("../settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("../anticheat/network-ban-core", () => ({
  NetworkBanError: class NetworkBanError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  banNetworkWith: mocks.ban,
  banGroupWith: mocks.group,
  liftNetworkBanWith: mocks.lift,
  keepNetworkBanWith: mocks.keep,
}));

import { banNetworkAction, liftNetworkBanAction } from "./admin-network-bans";

const SETTINGS: Record<string, unknown> = { "multiAccount.sharedIpCap": 8, "multiAccount.ipv4BanDays": 0 };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `sig${i}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdmin.mockResolvedValue({ id: "admin" });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.getSetting.mockImplementation(async (key: string) => SETTINGS[key]);
  mocks.ban.mockResolvedValue({ bans: 3, account: false });
  mocks.lift.mockResolvedValue(undefined);
});

describe("bannir depuis la fiche joueur", () => {
  it("accepte 60 relevés (un /64 IPv6 en accumule un par jour et par appareil) et lit les réglages", async () => {
    expect(await banNetworkAction({ userId: "player", signalIds: ids(60), banAccount: false, reason: "ferme" })).toEqual({ ok: true, bans: 3, account: false });
    expect(mocks.ban).toHaveBeenCalledWith({}, expect.objectContaining({ adminId: "admin", userId: "player", signalIds: ids(60), sharedIpCap: 8, ipv4BanDays: 0 }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refuse une liste démesurée, un visiteur et un champ inconnu, sans toucher à la base", async () => {
    expect(await banNetworkAction({ userId: "player", signalIds: ids(201), banAccount: false, reason: "x" })).toEqual({ ok: false, error: "INVALID" });
    expect(await banNetworkAction({ userId: "player", signalIds: [], banAccount: false, reason: "x", expiresAt: "jamais" })).toEqual({ ok: false, error: "INVALID" });
    mocks.getAdmin.mockResolvedValue(null);
    expect(await banNetworkAction({ userId: "player", signalIds: [], banAccount: true, reason: "x" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.ban).not.toHaveBeenCalled();
  });
});

describe("lever un ban", () => {
  it("transmet l'exemption du suivi demandée, et rien d'autre", async () => {
    expect(await liftNetworkBanAction({ banId: "b1", reason: "IP de lycée", exempt: true })).toEqual({ ok: true });
    expect(mocks.lift).toHaveBeenCalledWith({}, { adminId: "admin", banId: "b1", reason: "IP de lycée", exempt: true });
    expect(await liftNetworkBanAction({ banId: "b1", reason: "erreur" })).toEqual({ ok: true });
    expect(mocks.lift).toHaveBeenLastCalledWith({}, { adminId: "admin", banId: "b1", reason: "erreur", exempt: false });
    expect(await liftNetworkBanAction({ banId: "b1", reason: "x", exempt: "oui" })).toEqual({ ok: false, error: "INVALID" });
  });
});
