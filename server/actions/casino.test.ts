import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CASINO_RULES, type CasinoRules } from "@/lib/casino/rules";

// Frontière des actions du pile ou face : session, schéma, invités, casino fermé, pseudo réservé, relève validée.
// Le cœur (coinflip-core.ts), les lectures et le temps réel sont simulés.

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rateLimit: vi.fn(),
  rules: vi.fn(),
  lobby: vi.fn(),
  getTable: vi.fn(),
  cardViews: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  findUsers: vi.fn(),
  publish: vi.fn(),
  after: vi.fn((fn: () => unknown) => void fn()),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../admin", () => ({ getAdmin: vi.fn() }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../db", () => ({ prisma: { user: { findMany: mocks.findUsers } } }));
vi.mock("../push/send", () => ({ pushLater: vi.fn() }));
vi.mock("../realtime", () => ({ publishToUser: mocks.publish }));
vi.mock("../boosters/display", () => ({ cardViews: mocks.cardViews }));
vi.mock("../casino/deps", () => ({ coinFlipContext: async () => ({}) }));
vi.mock("../casino/queries", () => ({
  getCasinoRules: mocks.rules,
  getTable: mocks.getTable,
  listLobby: mocks.lobby,
  myTablesState: vi.fn(),
  recentFlips: vi.fn(),
}));
vi.mock("../casino/coinflip-core", () => {
  class CoinFlipError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    CoinFlipError,
    createTableWith: mocks.create,
    joinTableWith: mocks.join,
    adminCancelTableWith: vi.fn(),
    cancelTableWith: vi.fn(),
    declineTableWith: vi.fn(),
    markSeenWith: vi.fn(),
    sweepCasinoWith: vi.fn(),
  };
});

const { coinFlipLobbyAction, createCoinFlipAction, joinCoinFlipAction } = await import("./casino");
const { CoinFlipError } = await import("../casino/coinflip-core");

const OPEN: CasinoRules = { ...DEFAULT_CASINO_RULES, opensAt: Date.parse("2026-11-18T15:00:00Z") };
const member = { id: "me", isGuest: false, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null, role: "PLAYER" };
const createInput = { cardId: "card", side: "OMOTE", reservedFor: null, confirmLastCopy: false };
const joinInput = { flipId: "flip", cardId: "card", confirmLastCopy: false };
const played = { ok: true, flipId: "flip", creatorId: "creator", result: "URA", won: true, prize: { cardId: "prize", userCardId: "uc", isNew: true, wished: false } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(member);
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.rules.mockResolvedValue(OPEN);
  mocks.lobby.mockResolvedValue({ items: [], nextCursor: null });
  mocks.findUsers.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ flipId: "new" });
  mocks.join.mockResolvedValue(played);
  mocks.getTable.mockResolvedValue({ id: "flip", creatorId: "creator" });
  mocks.cardViews.mockResolvedValue(new Map([["prize", { cardId: "prize", name: "Gojou" }]]));
});

describe("actions du pile ou face", () => {
  it("sans session ni entrée valide, rien ne se lit ni ne s'écrit", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await createCoinFlipAction(createInput)).toEqual({ ok: false, error: "NO_SESSION" });
    mocks.user.mockResolvedValue(member);
    expect(await createCoinFlipAction({ ...createInput, userId: "autre" })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("un invité regarde le salon se mettre à jour, mais ne pose ni ne relève", async () => {
    mocks.user.mockResolvedValue({ ...member, isGuest: true });
    expect(await coinFlipLobbyAction({ tier: null, cursor: null })).toEqual({ ok: true, page: { items: [], nextCursor: null } });
    expect(await createCoinFlipAction(createInput)).toEqual({ ok: false, error: "GUEST" });
    expect(await joinCoinFlipAction(joinInput)).toEqual({ ok: false, error: "GUEST" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("casino pas encore ouvert : refusé, sauf aperçu de l'équipe", async () => {
    mocks.rules.mockResolvedValue({ ...OPEN, opensAt: null });
    expect(await createCoinFlipAction(createInput)).toEqual({ ok: false, error: "CLOSED" });
    mocks.user.mockResolvedValue({ ...member, role: "ADMIN" });
    expect(await createCoinFlipAction(createInput)).toEqual({ ok: true, flipId: "new" });
  });

  it("réservation : pseudo exact seulement (un « _ » n'est pas un joker)", async () => {
    mocks.findUsers.mockResolvedValue([{ id: "x", username: "soraXame" }]);
    expect(await createCoinFlipAction({ ...createInput, reservedFor: "sora_ame" })).toEqual({ ok: false, error: "RESERVE_TARGET" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.findUsers.mockResolvedValue([{ id: "x", username: "soraXame" }, { id: "s", username: "Sora_Ame" }]);
    expect(await createCoinFlipAction({ ...createInput, reservedFor: "sora_ame" })).toEqual({ ok: true, flipId: "new" });
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ userId: "me", reservedForId: "s" });
  });

  it("refus du cœur rendu tel quel", async () => {
    mocks.join.mockRejectedValue(new CoinFlipError("TIER"));
    expect(await joinCoinFlipAction(joinInput)).toEqual({ ok: false, error: "TIER" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("relève : la table jouée et la carte remportée, le créateur prévenu en direct", async () => {
    const res = await joinCoinFlipAction(joinInput);
    expect(res).toMatchObject({ ok: true, flipId: "flip", won: true, table: { id: "flip" }, prize: { cardId: "prize", userCardId: "uc", isNew: true } });
    expect(mocks.publish).toHaveBeenCalledWith("creator", "coinflip", { flipId: "flip" });
  });

  it("relève validée mais relecture impossible : succès sans la table, jamais « Action impossible », créateur prévenu", async () => {
    mocks.getTable.mockResolvedValue(null);
    expect(await joinCoinFlipAction(joinInput)).toEqual({ ok: true, flipId: "flip", table: null, won: true, prize: null });
    expect(mocks.publish).toHaveBeenCalledWith("creator", "coinflip", { flipId: "flip" });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getTable.mockRejectedValue(new Error("base indisponible"));
    expect(await joinCoinFlipAction(joinInput)).toMatchObject({ ok: true, table: null });
  });
});
