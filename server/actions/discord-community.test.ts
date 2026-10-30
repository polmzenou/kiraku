import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), request: vi.fn(), upsert: vi.fn(), publish: vi.fn(), log: vi.fn(), privateChannel: vi.fn(), configured: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("../db", () => ({ prisma: { discordPost: { upsert: mocks.upsert } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../discord/api", () => ({ discordBotRequest: mocks.request }));
vi.mock("../discord/posts", () => ({ publishDiscordPost: mocks.publish }));
vi.mock("../discord/private-channel", () => ({ assertPrivateDiscordChannel: mocks.privateChannel }));
vi.mock("../env", () => ({
  get discordRulesConfigured() { return mocks.configured; },
  env: { DISCORD_GUILD_ID: "1565773684243697905", DISCORD_RULES_CHANNEL_ID: "1565778336947634266", DISCORD_ROLES_CHANNEL_ID: "1565778506120433664",
    DISCORD_BOT_TOKEN: "private-token", AUTH_DISCORD_ID: "123456789012345678", DISCORD_PUBLIC_KEY: "a".repeat(64), DISCORD_MEMBER_ROLE_ID: "1565774539886039142",
    DISCORD_MERCHANT_ROLE_ID: "1565817691132928121", DISCORD_COLLECTOR_ROLE_ID: "1565818296002154506", DISCORD_FIGHTER_ROLE_ID: "1565818436355887214", DISCORD_ALERTS_CHANNEL_ID: "1565779152106291380" },
}));
import { publishDiscordRolesAction, publishDiscordRulesAction, testDiscordAlertsAction } from "./discord-community";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.request.mockResolvedValue({ guild_id: "1565773684243697905", type: 0 });
  mocks.publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
  mocks.privateChannel.mockResolvedValue(undefined);
});

describe("test des alertes privées depuis l'administration", () => {
  it("refuse les non-administrateurs avant tout accès au salon", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await testDiscordAlertsAction()).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.privateChannel).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("refuse de publier si le salon n'est pas privé", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.privateChannel.mockRejectedValueOnce(new Error("Salon public"));
    expect(await testDiscordAlertsAction()).toEqual({ ok: false, error: "DISCORD" });
    expect(mocks.publish).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("publie un test explicite sans mention générale, sous une clé non récursive", async () => {
    expect((await testDiscordAlertsAction()).ok).toBe(true);
    expect(mocks.publish).toHaveBeenCalledWith(expect.stringMatching(/^alert:test:/), expect.objectContaining({ allowed_mentions: { parse: [] } }), null, true);
    expect(mocks.log.mock.calls[0][1].action).toBe("DISCORD_ALERT_TEST");
  });
});

describe("publication du panneau de rôles", () => {
  const roles = ["1565817691132928121", "1565818296002154506", "1565818436355887214"].map((id) => ({ id, permissions: "0" }));
  const available = (list = roles) => mocks.request.mockImplementation(async (path: string) => path.endsWith("/roles") ? list : { guild_id: "1565773684243697905", type: 0 });
  it("exige l'administration avant de lire Discord ou d'écrire en base", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await publishDiscordRolesAction()).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("publie les trois préférences et le bouton de compte lié", async () => {
    available();
    expect((await publishDiscordRolesAction()).ok).toBe(true);
    const payload = mocks.publish.mock.calls[0][1];
    expect(payload.components[0].components.map((button: { label: string }) => button.label)).toEqual(["Marchand", "Collectionneur", "Fighter"]);
    expect(payload.components[1].components[0].custom_id).toBe("kiraku:account:verify:v1");
    expect(mocks.log.mock.calls[0][1].action).toBe("DISCORD_ROLES_PUBLISH");
  });
  it("refuse un rôle manquant ou privilégié", async () => {
    for (const list of [roles.slice(1), [{ ...roles[0], permissions: "8" }, ...roles.slice(1)]]) {
      available(list);
      expect(await publishDiscordRolesAction()).toEqual({ ok: false, error: "CONFIG" });
    }
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
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
