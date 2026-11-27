import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rateLimit: vi.fn(),
  settings: vi.fn(),
  owned: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../achievements/sync", () => ({ getAchievementSettings: mocks.settings }));
vi.mock("../db", () => ({ prisma: { userAchievement: { findUnique: mocks.owned }, user: { update: mocks.update } } }));
import { featureAchievementAction } from "./achievements";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player", isGuest: false, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.settings.mockResolvedValue({ enabled: true, goals: {}, disabled: [] });
  mocks.owned.mockResolvedValue({ key: "booster-50" });
  mocks.update.mockResolvedValue({ id: "player" });
});

describe("featureAchievementAction", () => {
  it("met en avant un succès débloqué, en n'écrivant que ce champ", async () => {
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: true });
    expect(mocks.owned).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_key: { userId: "player", key: "booster-50" } } }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "player" }, data: { featuredAchievement: "booster-50" }, select: { id: true } });
  });

  it("null retire la mise en avant sans vérifier de déblocage", async () => {
    expect(await featureAchievementAction({ key: null })).toEqual({ ok: true });
    expect(mocks.owned).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { featuredAchievement: null } }));
  });

  it("refuse sans session", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "NO_SESSION" });
  });

  it("refuse une clé inconnue ou un champ en trop", async () => {
    expect(await featureAchievementAction({ key: "inconnu" })).toEqual({ ok: false, error: "INVALID" });
    expect(await featureAchievementAction({ key: "booster-50", userId: "autre" })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuse un invité et un compte banni", async () => {
    mocks.user.mockResolvedValue({ id: "player", isGuest: true, bannedAt: null });
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "GUEST" });
    mocks.user.mockResolvedValue({ id: "player", isGuest: false, bannedAt: new Date() });
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuse un succès pas débloqué, désactivé, ou quand les succès sont coupés", async () => {
    mocks.owned.mockResolvedValue(null);
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "LOCKED" });
    mocks.owned.mockResolvedValue({ key: "booster-50" });
    mocks.settings.mockResolvedValue({ enabled: true, goals: {}, disabled: ["booster-50"] });
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "LOCKED" });
    mocks.settings.mockResolvedValue({ enabled: false, goals: {}, disabled: [] });
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "LOCKED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuse au-delà du rate limit", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await featureAchievementAction({ key: "booster-50" })).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
