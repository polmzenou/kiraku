import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordAlert } from "@/generated/prisma/client";

const config = vi.hoisted(() => ({ DISCORD_BOT_TOKEN: "private-token", DISCORD_GUILD_ID: "1565773684243697905", AUTH_DISCORD_ID: "1560046493153493164", DISCORD_ALERTS_CHANNEL_ID: "1565779152106291380" as string | undefined }));
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), resolve: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), post: vi.fn(), publish: vi.fn(), request: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ env: config, appUrl: () => "https://kiraku.example" }));
vi.mock("../db", () => ({ prisma: { discordAlert: { upsert: mocks.upsert, updateMany: mocks.updateMany, findMany: mocks.findMany }, discordPost: { upsert: mocks.post } } }));
vi.mock("./posts", () => ({ publishDiscordPost: mocks.publish }));
vi.mock("./api", async (original) => ({ ...await original<object>(), discordBotRequest: mocks.request }));
import { discordAlertId, recordDiscordAlert, resolveDiscordAlert } from "./alert-store";
import { assertPrivateDiscordChannel } from "./private-channel";
import { syncDiscordAlerts, technicalAlertMessage } from "./alerts";

const alert = (): DiscordAlert => ({ id: "incident1", kind: "publication", sourceId: "auction:a1", httpStatus: 403, occurrences: 3, firstSeenAt: new Date("2026-10-30T12:00:00Z"), lastSeenAt: new Date("2026-10-30T12:10:00Z"), resolvedAt: null, dirty: true, lastNotifiedAt: null, nextAttemptAt: new Date() });
let channel: { guild_id: string; type: number; permission_overwrites: { id: string; type: number; allow: string; deny: string }[] };
beforeEach(() => {
  vi.clearAllMocks();
  config.DISCORD_ALERTS_CHANNEL_ID = "1565779152106291380";
  channel = { guild_id: config.DISCORD_GUILD_ID, type: 0, permission_overwrites: [
    { id: config.DISCORD_GUILD_ID, type: 0, allow: "0", deny: "1024" },
    { id: "staff", type: 0, allow: "1024", deny: "0" },
    { id: config.AUTH_DISCORD_ID, type: 1, allow: "84992", deny: "0" },
  ] };
  mocks.request.mockImplementation(async (path: string) => path.endsWith("/roles") ? [{ id: "staff", permissions: "8192" }, { id: "member", permissions: "0" }] : channel);
  mocks.findMany.mockResolvedValue([alert()]);
  mocks.publish.mockResolvedValue({ ok: true, messageId: "message" });
  mocks.upsert.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("file des incidents techniques", () => {
  it("regroupe le même incident sans réarmer le délai de publication", async () => {
    await recordDiscordAlert("publication", "auction:a1", 403);
    await recordDiscordAlert("publication", "auction:a1", 429);
    expect(mocks.upsert.mock.calls[0][0].where.id).toBe(mocks.upsert.mock.calls[1][0].where.id);
    expect(mocks.upsert.mock.calls[1][0].update).toMatchObject({ occurrences: { increment: 1 }, httpStatus: 429, dirty: true, resolvedAt: null });
    expect(mocks.upsert.mock.calls[1][0].update).not.toHaveProperty("nextAttemptAt");
  });
  it("réserve un identifiant distinct à chaque source et type", () => {
    expect(discordAlertId("publication", "auction:a1")).not.toBe(discordAlertId("linked-role", "auction:a1"));
    expect(discordAlertId("publication", "auction:a1")).not.toBe(discordAlertId("publication", "auction:a2"));
  });
  it("ignore les références contenant du texte libre ou des URLs", async () => {
    await recordDiscordAlert("publication", "https://discord.example/token");
    await recordDiscordAlert("publication", "raw error private-token");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("ne fait pas échouer le traitement principal quand la base est indisponible", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("private-token"));
    await expect(recordDiscordAlert("publication", "auction:a1", 403)).resolves.toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-token");
  });
  it("marque l'incident résolu et laisse le cron actualiser le message", async () => {
    await resolveDiscordAlert("linked-role", "123456789012345678");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { resolvedAt: expect.any(Date), dirty: true } }));
  });
  it("ne fait rien sans configuration d'alertes", async () => {
    config.DISCORD_ALERTS_CHANNEL_ID = undefined;
    await recordDiscordAlert("cron", "market");
    expect(await syncDiscordAlerts()).toEqual({ sent: 0, failed: 0 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("relais privé et absence de boucle d'alertes", () => {
  it("publie une référence stable, sans mention ni corps d'erreur", async () => {
    expect(await syncDiscordAlerts()).toEqual({ sent: 1, failed: 0 });
    expect(mocks.publish).toHaveBeenCalledWith("alert:1565779152106291380:incident1", expect.objectContaining({ allowed_mentions: { parse: [] } }), null);
    const payload = mocks.publish.mock.calls[0][1];
    expect(payload.embeds[0].description).toContain("permissions");
    expect(payload.embeds[0].fields).toContainEqual({ name: "Occurrences", value: "3", inline: true });
    expect(mocks.findMany.mock.calls[0][0].where.AND[0].OR[1].lastNotifiedAt.lte.getTime()).toBeLessThanOrEqual(Date.now() - 899_000);
    expect(mocks.updateMany.mock.calls[0][0].where).toMatchObject({ lastSeenAt: alert().lastSeenAt, resolvedAt: null });
  });
  it("bloque le relais si Membre ou un utilisateur ordinaire peut lire le salon", async () => {
    channel.permission_overwrites.push({ id: "member", type: 0, allow: "1024", deny: "0" });
    expect(await syncDiscordAlerts()).toEqual({ sent: 0, failed: 1 });
    expect(mocks.publish).not.toHaveBeenCalled();
    channel.permission_overwrites.pop();
    channel.permission_overwrites.push({ id: "someone", type: 1, allow: "1024", deny: "0" });
    await expect(assertPrivateDiscordChannel(config.DISCORD_ALERTS_CHANNEL_ID!)).rejects.toThrow();
  });
  it("refuse un salon public ou appartenant à un autre serveur", async () => {
    channel.permission_overwrites = [];
    await expect(assertPrivateDiscordChannel(config.DISCORD_ALERTS_CHANNEL_ID!)).rejects.toThrow();
    channel.guild_id = "other";
    await expect(assertPrivateDiscordChannel(config.DISCORD_ALERTS_CHANNEL_ID!)).rejects.toThrow();
  });
  it("accepte le développeur Kiraku même avec des droits globaux limités", async () => {
    channel.permission_overwrites.push({ id: "1565774480813334590", type: 0, allow: "1115136", deny: "274877908992" });
    mocks.request.mockImplementation(async (path: string) => path.endsWith("/roles") ? [
      { id: "staff", permissions: "8192" }, { id: "1565774480813334590", permissions: "2252074691641344" },
    ] : channel);
    await expect(assertPrivateDiscordChannel(config.DISCORD_ALERTS_CHANNEL_ID!)).resolves.toBeUndefined();
  });
  it("actualise le même message pour afficher la résolution", () => {
    expect(technicalAlertMessage({ ...alert(), resolvedAt: new Date() }).content).toContain("Incident résolu");
    expect(technicalAlertMessage({ ...alert(), resolvedAt: new Date() }).embeds![0].url).toBe(technicalAlertMessage(alert()).embeds![0].url);
  });
  it("reporte les échecs de son propre salon sans créer un nouvel incident", async () => {
    mocks.publish.mockResolvedValue({ ok: false, error: "DISCORD" });
    expect(await syncDiscordAlerts()).toEqual({ sent: 0, failed: 1 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls[0][0].data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 299_000);
  });
});
