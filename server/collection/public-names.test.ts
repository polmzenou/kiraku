import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NamedPlayer } from "@/lib/collection/display-name";

const mocks = vi.hoisted(() => ({ user: vi.fn(), blocks: vi.fn(), friendships: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => ({ hidden: "Joueur", deleted: "Compte supprimé" })[key] }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../db", () => ({ prisma: { userBlock: { findMany: mocks.blocks }, friendship: { findMany: mocks.friendships } } }));
const { publicNamesFor, revealsHiddenNames } = await import("./public-names");

const player = (o: Partial<NamedPlayer> = {}): NamedPlayer => ({ id: "p1", username: "Kaito", profileVisibility: "PRIVATE", bannedAt: null, anonymizedAt: null, ...o });
const admin = { id: "admin", role: "ADMIN", bannedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.blocks.mockResolvedValue([]);
  mocks.friendships.mockResolvedValue([]);
});

describe("pseudos cachés lus par l'admin", () => {
  it("révèle un profil privé à l'admin de la session, avec la marque du cadenas", async () => {
    mocks.user.mockResolvedValue(admin);
    const nameOf = await publicNamesFor("admin", [player()]);
    expect(nameOf(player())).toEqual({ name: "Kaito", revealed: true });
    expect(nameOf(player({ id: "p2", username: "Rin", profileVisibility: "PUBLIC" }))).toEqual({ name: "Rin", revealed: false });
    expect(nameOf(player({ id: "p3", anonymizedAt: new Date() }))).toEqual({ name: "Compte supprimé", revealed: false });
  });

  it.each([
    ["un joueur", { id: "v1", role: "USER", bannedAt: null }, "v1"],
    ["un dev du catalogue", { id: "v1", role: "DEV", bannedAt: null }, "v1"],
    ["un admin banni", { ...admin, bannedAt: new Date() }, "admin"],
    ["un id d'admin qui n'est pas la session", { id: "v1", role: "USER", bannedAt: null }, "admin"],
  ])("garde « Joueur » pour %s", async (_label, session, viewerId) => {
    mocks.user.mockResolvedValue(session);
    expect((await publicNamesFor(viewerId, [player()]))(player())).toEqual({ name: "Joueur", revealed: false });
  });

  it("ne révèle rien à un visiteur sans session", async () => {
    expect(await revealsHiddenNames(null)).toBe(false);
    expect((await publicNamesFor(null, [player()]))(player())).toEqual({ name: "Joueur", revealed: false });
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
