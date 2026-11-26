import { beforeEach, describe, expect, it, vi } from "vitest";

const GUILD = "1565773684243697905";
const CHANNEL = "1565800000000000003";
const mocks = vi.hoisted(() => ({ request: vi.fn(), publish: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/components/referral/step-meta", () => ({ stepConditions: () => ({}) }));
vi.mock("../db", () => ({ prisma: { discordPost: { upsert: mocks.upsert, findUnique: mocks.findUnique } } }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordAnnounceConfigured: true, env: { DISCORD_GUILD_ID: "1565773684243697905", DISCORD_ANNOUNCE_CHANNEL_ID: "1565800000000000003" } }));
vi.mock("../catalog/rarities", () => ({ getRarityDefinitions: async () => [] }));
vi.mock("../ennichi/queries", () => ({ ennichiView: async () => ({ phase: "off" }) }));
vi.mock("../referral/deps", () => ({ referralV2Rules: async () => ({}) }));
vi.mock("../referral/queries", () => ({ referralGifts: async () => ({ steps: [{ step: 1, referee: null, referrerTotal: null }] }) }));
vi.mock("./api", () => ({ discordBotRequest: mocks.request }));
vi.mock("./posts", () => ({ publishDiscordPost: mocks.publish }));
import { publishReferralAnnouncement, referralAnnounceState } from "./referral-announce";

const KEY = `announce:referral:${GUILD}:${CHANNEL}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({ guild_id: GUILD, type: 5 });
  mocks.publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
});

describe("annonce du lancement du parrainage (salon public)", () => {
  it.each([{ guild_id: "999999999999999999", type: 0 }, { guild_id: GUILD, type: 2 }])("refuse un salon d'un autre serveur ou qui n'est pas textuel (%o)", async (channel) => {
    mocks.request.mockResolvedValue(channel);
    expect(await publishReferralAnnouncement()).toEqual({ ok: false, error: "CONFIG" });
    expect(mocks.request).toHaveBeenCalledWith(`/channels/${CHANNEL}`);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("publie sous sa propre clé, hors de toute reprise du cron, et rend le lien du message", async () => {
    const result = await publishReferralAnnouncement();
    expect(result).toEqual({ ok: true, messageId: "123456789012345678", url: `https://discord.com/channels/${GUILD}/${CHANNEL}/123456789012345678` });
    // nextAttemptAt nul : aucun cron ne reprend ce message, seul le bouton de l'admin publie
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { key: KEY }, update: {}, create: { key: KEY, channelId: CHANNEL, nextAttemptAt: null } });
    // Republication explicite : le même message est mis à jour (force), jamais un second @everyone
    expect(mocks.publish).toHaveBeenCalledWith(KEY, expect.objectContaining({ allowed_mentions: expect.objectContaining({ parse: ["everyone"] }) }), null, true);
  });
  it("rend l'échec de la publication tel quel", async () => {
    mocks.publish.mockResolvedValue({ ok: false, error: "DISCORD" });
    expect(await publishReferralAnnouncement()).toEqual({ ok: false, error: "DISCORD" });
  });
  it("montre le lien seulement une fois le message publié", async () => {
    mocks.findUnique.mockResolvedValue({ messageId: null, createdAt: new Date() });
    expect(await referralAnnounceState()).toEqual({ configured: true, publishedAt: null, url: null });
    mocks.findUnique.mockResolvedValue({ messageId: "123456789012345678", createdAt: new Date("2026-11-25T10:00:00Z") });
    expect((await referralAnnounceState()).url).toBe(`https://discord.com/channels/${GUILD}/${CHANNEL}/123456789012345678`);
  });
});
