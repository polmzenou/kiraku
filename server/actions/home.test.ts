import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), rateLimit: vi.fn(), pulls: vi.fn(), setLike: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user, requireActiveUser: mocks.user }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit, clientIp: async () => "local" }));
vi.mock("../home/pulls", () => ({ getRecentPulls: mocks.pulls, purgeOldPulls: vi.fn() }));
vi.mock("../home/pull-likes", () => ({ pullLikes: { set: mocks.setLike } }));
vi.mock("../collection/owned", () => ({ ownedCardIds: async () => [] }));
import { setRecentPullLikeAction } from "./home";

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
