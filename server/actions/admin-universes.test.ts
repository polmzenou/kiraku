import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), merge: vi.fn(), remove: vi.fn(), create: vi.fn(), rename: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../catalog/universes-core", async (original) => ({
  ...(await original<typeof import("../catalog/universes-core")>()),
  mergeUniversesWith: mocks.merge,
  removeSeriesFromUniverseWith: mocks.remove,
  createUniverseWith: mocks.create,
  renameUniverseWith: mocks.rename,
}));
import { UniverseError } from "../catalog/universes-core";
import { adminCreateUniverseAction, adminMergeUniversesAction, adminRemoveSeriesFromUniverseAction, adminRenameUniverseAction } from "./admin-universes";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
});

describe("actions de /admin/univers", () => {
  it("ferme tout aux non-admins, avant même de lire les entrées", async () => {
    mocks.admin.mockResolvedValue(null);
    await expect(adminMergeUniversesAction({ fromId: "a", intoId: "b" })).resolves.toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("refuse une entrée invalide ou un champ en trop, sans écrire", async () => {
    await expect(adminMergeUniversesAction({ fromId: "a" })).resolves.toEqual({ ok: false, error: "INVALID" });
    await expect(adminMergeUniversesAction({ fromId: "a", intoId: "b", extra: 1 })).resolves.toEqual({ ok: false, error: "INVALID" });
    await expect(adminCreateUniverseAction({ name: "   " })).resolves.toEqual({ ok: false, error: "INVALID" });
    await expect(adminCreateUniverseAction({ name: "x".repeat(81) })).resolves.toEqual({ ok: false, error: "INVALID" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("applique le rate limit", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    await expect(adminMergeUniversesAction({ fromId: "a", intoId: "b" })).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("écrit le nom nettoyé, et rafraîchit la page après une réussite", async () => {
    await expect(adminRenameUniverseAction({ universeId: "u1", name: "  Jujutsu\n Kaisen " })).resolves.toEqual({ ok: true });
    expect(mocks.rename).toHaveBeenCalledWith(expect.anything(), "admin", "u1", "Jujutsu Kaisen");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("traduit les erreurs du cœur, sans rafraîchir", async () => {
    mocks.remove.mockRejectedValue(new UniverseError("ALONE"));
    await expect(adminRemoveSeriesFromUniverseAction({ universeId: "u1", seriesId: "s1" })).resolves.toEqual({ ok: false, error: "ALONE" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ne divulgue pas une panne de base", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.merge.mockRejectedValue(new Error("connexion perdue vers 10.0.0.1"));
    await expect(adminMergeUniversesAction({ fromId: "a", intoId: "b" })).resolves.toEqual({ ok: false, error: "UNEXPECTED" });
  });
});
