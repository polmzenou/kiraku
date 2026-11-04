import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), rateLimit: vi.fn(), pulls: vi.fn(), setLike: vi.fn(), gauge: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user, requireActiveUser: mocks.user }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit, clientIp: async () => "local" }));
vi.mock("../home/pulls", () => ({ getRecentPulls: mocks.pulls, purgeOldPulls: vi.fn() }));
vi.mock("../home/pull-likes", () => ({ pullLikes: { set: mocks.setLike } }));
vi.mock("../collection/owned", () => ({ ownedCardIds: async () => [] }));
vi.mock("../home/event-gauge", () => ({ getEventGauge: mocks.gauge }));
import { eventGaugeAction, setRecentPullLikeAction } from "./home";

const pull = { id: "pull", at: "2026-10-31T12:00:00Z", profile: null, likes: { count: 0, liked: false, canLike: true } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "alice" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.pulls.mockResolvedValue([pull]);
  mocks.setLike.mockReturnValue({ count: 1, liked: true });
});

describe("likes des gros tirages : autorisation serveur", () => {
  it("refuse les visiteurs et comptes inactifs", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await setRecentPullLikeAction({ pullId: "pull", liked: true })).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it.each([{}, { pullId: "pull", liked: "true" }, { pullId: "", liked: true }, { pullId: "pull", liked: true, playerId: "bob" }])("refuse une entrée invalide ou une identité fournie par le client : %j", async (input) => {
    expect(await setRecentPullLikeAction(input)).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it("interdit de liker son propre tirage même si le profil est masqué", async () => {
    mocks.pulls.mockResolvedValue([{ ...pull, likes: { ...pull.likes, canLike: false } }]);
    expect(await setRecentPullLikeAction({ pullId: "pull", liked: true })).toEqual({ ok: false, error: "OWN_PULL" });
    expect(mocks.pulls).toHaveBeenCalledWith("fr", "alice");
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it.each([null, []])("refuse un tirage absent du fil ou un fil désactivé : %j", async (pulls) => {
    mocks.pulls.mockResolvedValue(pulls);
    expect(await setRecentPullLikeAction({ pullId: "pull", liked: true })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it("applique la limite en mémoire, sans écriture du compteur en base", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await setRecentPullLikeAction({ pullId: "pull", liked: true })).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.rateLimit).toHaveBeenCalledWith("pull-like:alice", { limit: 60, windowSeconds: 60 }, { store: "memory" });
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it.each([true, false])("utilise l'identité de la session pour poser ou retirer le like : %j", async (liked) => {
    mocks.setLike.mockReturnValue({ count: liked ? 1 : 0, liked });
    expect(await setRecentPullLikeAction({ pullId: "pull", liked })).toEqual({ ok: true, likes: { count: liked ? 1 : 0, liked, canLike: true } });
    expect(mocks.setLike).toHaveBeenCalledWith(pull, "alice", liked);
  });
});

describe("jauge communautaire : lecture publique", () => {
  const gauge = { phase: "live", count: 12, goal: 100 };

  it("répond aux visiteurs sans session, limités par IP", async () => {
    mocks.user.mockResolvedValue(null);
    mocks.gauge.mockResolvedValue(gauge);
    expect(await eventGaugeAction({})).toEqual({ ok: true, gauge });
    expect(mocks.rateLimit.mock.calls[0]?.[0]).toBe("event-gauge:local");
  });

  it("refuse toute entrée venant du client, comme un compte choisi", async () => {
    expect(await eventGaugeAction({ count: 20000 })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.gauge).not.toHaveBeenCalled();
  });

  it("applique la limite de débit", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await eventGaugeAction({})).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.gauge).not.toHaveBeenCalled();
  });

  it("signale une jauge coupée par l'admin", async () => {
    mocks.gauge.mockResolvedValue(null);
    expect(await eventGaugeAction({})).toEqual({ ok: false, error: "DISABLED" });
  });
});
