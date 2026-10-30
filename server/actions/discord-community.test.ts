import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), request: vi.fn(), upsert: vi.fn(), publish: vi.fn(), log: vi.fn(), configured: true }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("../db", () => ({ prisma: { discordPost: { upsert: mocks.upsert } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../discord/api", () => ({ discordBotRequest: mocks.request }));
vi.mock("../discord/posts", () => ({ publishDiscordPost: mocks.publish }));
vi.mock("../env", () => ({
  get discordRulesConfigured() { return mocks.configured; },
  env: { DISCORD_GUILD_ID: "1565773684243697905", DISCORD_RULES_CHANNEL_ID: "1565778336947634266" },
}));
import { publishDiscordRulesAction } from "./discord-community";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.request.mockResolvedValue({ guild_id: "1565773684243697905", type: 0 });
  mocks.publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
});

describe("publication du bouton depuis l'admin", () => {
  it("refuse un utilisateur ordinaire avant tout envoi ou écriture", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await publishDiscordRulesAction()).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("ne publie pas dans un salon appartenant à un autre serveur", async () => {
    mocks.request.mockResolvedValue({ guild_id: "other-guild", type: 0 });
    expect(await publishDiscordRulesAction()).toEqual({ ok: false, error: "CONFIG" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("respecte la limite et exige une configuration complète", async () => {
    mocks.configured = false;
    expect(await publishDiscordRulesAction()).toEqual({ ok: false, error: "CONFIG" });
    mocks.configured = true;
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await publishDiscordRulesAction()).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("publie explicitement et journalise le message sans secrets", async () => {
    const result = await publishDiscordRulesAction();
    expect(result).toEqual({ ok: true, url: "https://discord.com/channels/1565773684243697905/1565778336947634266/123456789012345678" });
    expect(mocks.publish.mock.calls[0][3]).toBe(true);
    expect(mocks.log.mock.calls[0][1]).toMatchObject({ adminId: "admin", action: "DISCORD_RULES_PUBLISH" });
  });
});
