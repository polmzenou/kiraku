import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), updateMany: vi.fn(), rateLimit: vi.fn() }));
vi.mock("../user", () => ({ requireActiveUser: mocks.user }));
vi.mock("../db", () => ({ prisma: { user: { updateMany: mocks.updateMany } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
import { RELEASE_ANNOUNCED_AT } from "@/lib/welcome/release";
import { claimV1WelcomeAction } from "./welcome";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: null });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("présentation v1 unique par compte", () => {
  it("refuse les visiteurs et les comptes inactifs", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await claimV1WelcomeAction("player")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("ne réserve jamais l'affichage d'un autre compte", async () => {
    expect(await claimV1WelcomeAction("another-player")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([null, 42, {}, "", "x".repeat(129)])("refuse une entrée invalide : %j", async (input) => {
    expect(await claimV1WelcomeAction(input)).toBe(false);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("ne représente pas le modal après reconnexion ou changement d'appareil", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: new Date(RELEASE_ANNOUNCED_AT.getTime() + 1000) });
    expect(await claimV1WelcomeAction("player")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("présente une fois la nouvelle version à qui n'avait vu que l'ancienne", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: new Date(RELEASE_ANNOUNCED_AT.getTime() - 1000) });
    expect(await claimV1WelcomeAction("player")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });

  it("enregistre l'affichage sur le joueur de la session", async () => {
    expect(await claimV1WelcomeAction("player")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "player",
        OR: [{ v1WelcomeSeenAt: null }, { v1WelcomeSeenAt: { lt: RELEASE_ANNOUNCED_AT } }],
        bannedAt: null,
        deletionRequestedAt: null,
        anonymizedAt: null,
      },
      data: { v1WelcomeSeenAt: expect.any(Date) },
    });
  });

  it("n'autorise qu'un seul de deux appareils ou onglets simultanés", async () => {
    let seen = false;
    mocks.updateMany.mockImplementation(async () => {
      if (seen) return { count: 0 };
      seen = true;
      return { count: 1 };
    });
    expect(await Promise.all([claimV1WelcomeAction("player"), claimV1WelcomeAction("player")])).toEqual([true, false]);
  });

  it("ne marque rien lorsque la limite est atteinte", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await claimV1WelcomeAction("player")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
