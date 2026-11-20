import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), networkBan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./auth", () => ({ auth: mocks.auth }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("./anticheat/network-ban", () => ({
  requestNetworkBan: mocks.networkBan,
  blocks: (ban: unknown, role: string) => ban !== null && role !== "ADMIN" && role !== "DEV",
}));
import { getCurrentUser, requireActiveUser } from "./user";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "player" } });
  mocks.networkBan.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue({ id: "player", role: "USER", isGuest: true, passwordHash: "secret-hash", bannedAt: null, deletionRequestedAt: null, anonymizedAt: null });
});

describe("réseau banni (IP ou appareil)", () => {
  const since = new Date("2026-11-20T10:00:00Z");

  it("traite le joueur comme banni, depuis la date du ban", async () => {
    mocks.networkBan.mockResolvedValue({ bans: [], ipKey: null, device: null, since });
    expect((await getCurrentUser())?.bannedAt).toEqual(since);
    expect(await requireActiveUser()).toBeNull();
  });

  it("garde la date d'un ban de compte antérieur", async () => {
    const banned = new Date("2026-01-01T00:00:00Z");
    mocks.networkBan.mockResolvedValue({ bans: [], ipKey: null, device: null, since });
    mocks.findUnique.mockResolvedValue({ id: "player", role: "USER", passwordHash: null, bannedAt: banned, deletionRequestedAt: null, anonymizedAt: null });
    expect((await getCurrentUser())?.bannedAt).toEqual(banned);
  });

  it("laisse passer l'équipe", async () => {
    mocks.networkBan.mockResolvedValue({ bans: [], ipKey: null, device: null, since });
    for (const role of ["ADMIN", "DEV"]) {
      mocks.findUnique.mockResolvedValue({ id: "staff", role, passwordHash: null, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null });
      expect(await requireActiveUser(), role).toMatchObject({ id: "staff", bannedAt: null });
    }
  });
});

describe("garde commune des actions et sondages", () => {
  it("exige une session avant de lire le joueur", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await requireActiveUser()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it.each(["bannedAt", "deletionRequestedAt", "anonymizedAt"])("refuse un joueur avec %s", async (field) => {
    mocks.findUnique.mockResolvedValue({ id: "player", passwordHash: null, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null, [field]: new Date() });
    expect(await requireActiveUser()).toBeNull();
  });
  it("accepte un invité actif et ne renvoie jamais son hash", async () => {
    const user = await requireActiveUser();
    expect(user).toMatchObject({ id: "player", isGuest: true, hasPassword: true });
    expect(user).not.toHaveProperty("passwordHash");
  });
  it("refuse une session dont le joueur n'existe plus", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
});
