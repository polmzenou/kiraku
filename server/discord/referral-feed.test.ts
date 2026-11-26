import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordApiError } from "./api";

const CHANNEL = "1565800000000000004";
// Aucun événement récent à mettre en file ; fiches introuvables
const none = vi.hoisted(() => () => ({ findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) }));
const db = vi.hoisted(() => ({ post: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() } }));
const mocks = vi.hoisted(() => ({ assert: vi.fn(), publish: vi.fn(), drop: vi.fn(), record: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: {
  discordPost: db.post, referralReward: none(), referral: none(), adminLog: none(), ambassadorProposal: none(), ennichiTierReached: none(), ennichiDraw: none(),
} }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordReferralConfigured: true, env: { DISCORD_REFERRAL_CHANNEL_ID: "1565800000000000004" } }));
vi.mock("../settings", () => ({ getSetting: async () => undefined }));
vi.mock("../catalog/rarities", () => ({ getRarityDefinitions: async () => [] }));
vi.mock("../economy/lot-view", () => ({ lotViews: async () => new Map() }));
vi.mock("../referral/deps", () => ({ referralV2Rules: async () => ({}) }));
vi.mock("../referral/tracking-queries", () => ({ referralFiche: async () => null }));
vi.mock("./private-channel", () => ({ assertPrivateDiscordChannel: mocks.assert }));
vi.mock("./posts", () => ({ publishDiscordPost: mocks.publish, dropDiscordPost: mocks.drop }));
vi.mock("./alert-store", () => ({ recordDiscordAlert: mocks.record, resolveDiscordAlert: mocks.resolve }));
import { syncDiscordReferrals } from "./referral-feed";

beforeEach(() => {
  vi.clearAllMocks();
  db.post.findMany.mockResolvedValue([{ key: "referral:hold:r1" }]);
  mocks.assert.mockResolvedValue(undefined);
});

describe("fil du parrainage dans le salon privé de l'équipe", () => {
  it("ne reprend que les messages du salon vérifié", async () => {
    await syncDiscordReferrals();
    expect(db.post.findMany.mock.calls[0][0].where).toMatchObject({ key: { startsWith: "referral:" }, channelId: CHANNEL });
    expect(mocks.assert).toHaveBeenCalledWith(CHANNEL);
  });
  it("signale dans #logs-bot un salon refusé au lieu de s'arrêter sans bruit", async () => {
    mocks.assert.mockRejectedValue(new DiscordApiError(403));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await syncDiscordReferrals()).toEqual({ relayed: 0, failed: 1 });
    expect(mocks.record).toHaveBeenCalledWith("publication", "referral-channel", 403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("clôt l'incident du salon une fois le salon de nouveau accepté", async () => {
    await syncDiscordReferrals();
    expect(mocks.resolve).toHaveBeenCalledWith("publication", "referral-channel");
    // Fiche introuvable : le message sort de la file sans être publié
    expect(mocks.drop).toHaveBeenCalledWith("referral:hold:r1");
  });
  it("ne contrôle pas le salon sans message à publier", async () => {
    db.post.findMany.mockResolvedValue([]);
    expect(await syncDiscordReferrals()).toEqual({ relayed: 0, failed: 0 });
    expect(mocks.assert).not.toHaveBeenCalled();
  });
});
