import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./auth", () => ({ auth: mocks.auth }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
import { getCurrentUser, requireActiveUser } from "./user";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "player" } });
  mocks.findUnique.mockResolvedValue({ id: "player", isGuest: true, passwordHash: "secret-hash", bannedAt: null, deletionRequestedAt: null, anonymizedAt: null });
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
