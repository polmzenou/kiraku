import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdmin: vi.fn(), mutate: vi.fn(), limit: vi.fn(), refresh: vi.fn(), updateTag: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), remove: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.getAdmin }));
vi.mock("../db", () => ({ prisma: { card: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh, updateTag: mocks.updateTag }));
vi.mock("../collection/leaderboard", () => ({ LEADERBOARD_TAG: "leaderboard" }));
vi.mock("../social/reviews", () => ({ REVIEWS_TAG: "reviews" }));
vi.mock("../market/queries", () => ({ pushLater: vi.fn() }));
vi.mock("../admin/users-delete-core", async (original) => ({ ...await original<typeof import("../admin/users-delete-core")>(), deleteUserWith: mocks.remove }));
vi.mock("../admin/users-core", async (original) => ({ ...await original<typeof import("../admin/users-core")>(), mutateAdminUserWith: mocks.mutate }));

import { adminDeleteUsersAction, mutateAdminUserAction, searchAdminCards } from "./admin-users";
import { UserDeleteError } from "../admin/users-delete-core";
import { AdminUserMutationError } from "../admin/users-core";

const input = { userId: "player", reason: "Correction", kind: "coins", mode: "ADD", amount: 100 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdmin.mockResolvedValue({ id: "admin" });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.mutate.mockResolvedValue(undefined);
  mocks.findFirst.mockResolvedValue(null);
  mocks.findMany.mockResolvedValue([]);
});

describe("frontière des actions admin utilisateurs", () => {
  it("refuse les visiteurs et ne révèle aucune carte", async () => {
    mocks.getAdmin.mockResolvedValue(null);
    expect(await mutateAdminUserAction(input)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await searchAdminCards("Levi")).toEqual([]);
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("valide les données avant de toucher la base", async () => {
    expect(await mutateAdminUserAction({ ...input, role: "ADMIN" })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("limite les modifications", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect(await mutateAdminUserAction(input)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("renvoie les erreurs métier sans rafraîchir la page", async () => {
    mocks.mutate.mockRejectedValue(new AdminUserMutationError("CARDS_LOCKED"));
    expect(await mutateAdminUserAction(input)).toEqual({ ok: false, error: "CARDS_LOCKED" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("utilise l'admin de la session et actualise les données", async () => {
    expect(await mutateAdminUserAction(input)).toEqual({ ok: true });
    expect(mocks.mutate).toHaveBeenCalledWith(expect.anything(), "admin", input, expect.any(Function));
    expect(mocks.updateTag).toHaveBeenCalledWith("leaderboard");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("donne priorité à un numéro AniList exact, même hors catalogue", async () => {
    const card = { id: "card", name: "Levi", anilistId: 456, publicId: 456, rank: null, rarity: "MYTHIC", imageUrl: "https://s4.anilist.co/card.jpg", series: { titleRomaji: "Attack on Titan" } };
    mocks.findFirst.mockResolvedValue(card);
    expect(await searchAdminCards("456")).toEqual([{ ...card, series: "Attack on Titan" }]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("ne transforme pas la ponctuation seule en recherche de tout le catalogue", async () => {
    expect(await searchAdminCards("%%%" )).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("suppression de comptes depuis l'admin", () => {
  const del = { ids: ["a", "b", "a"], reason: "Spam", confirm: "SUPPRIMER" };

  it("refuse un visiteur, un mot de confirmation faux ou trop de comptes", async () => {
    mocks.getAdmin.mockResolvedValueOnce(null);
    expect(await adminDeleteUsersAction(del)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await adminDeleteUsersAction({ ...del, confirm: "oui" })).toEqual({ ok: false, error: "INVALID" });
    expect(await adminDeleteUsersAction({ ...del, ids: Array.from({ length: 51 }, (_, i) => `u${i}`) })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("supprime chaque compte une fois et rapporte les refus sans s'arrêter", async () => {
    mocks.remove.mockRejectedValueOnce(new UserDeleteError("ADMIN_PROTECTED")).mockResolvedValueOnce({ username: "b" });
    expect(await adminDeleteUsersAction(del)).toEqual({ ok: true, deleted: ["b"], failed: [{ id: "a", error: "ADMIN_PROTECTED" }] });
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
