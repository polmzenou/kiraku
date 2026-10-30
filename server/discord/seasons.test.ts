import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RANKED_RULES } from "@/lib/ranked/defaults";
import type { SeasonSnapshot } from "@/lib/discord/season";

const mocks = vi.hoisted(() => ({ setting: vi.fn(), rules: vi.fn(), roll: vi.fn(), closed: vi.fn(), jobs: vi.fn(), create: vi.fn(), update: vi.fn(), publish: vi.fn(), image: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ env: { DISCORD_BOT_TOKEN: "private", DISCORD_GUILD_ID: "guild", DISCORD_RANKED_CHANNEL_ID: "ranked", DISCORD_FIGHTER_ROLE_ID: "fighter" }, appUrl: () => "https://kiraku.example" }));
vi.mock("../db", () => ({ prisma: { season: { findMany: mocks.closed }, discordPost: { findMany: mocks.jobs, createMany: mocks.create, updateMany: mocks.update } } }));
vi.mock("../settings", () => ({ getSetting: mocks.setting }));
vi.mock("../ranked/queries", () => ({ getRankedRules: mocks.rules }));
vi.mock("../ranked/ranked-core", () => ({ rollSeasonWith: mocks.roll }));
vi.mock("./posts", () => ({ publishDiscordPost: mocks.publish }));
vi.mock("./season-image", () => ({ seasonImage: mocks.image }));
import { seasonMessage, syncDiscordSeasons } from "./seasons";

const snapshot: SeasonSnapshot = { version: 1, number: 4, nextNumber: 5, closedAt: "2026-11-01T00:00:00.000Z", total: 1, entries: [{ position: 1, username: "rover", pc: 1882, image: null, tier: "GRAND_CHAMPION", division: null }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setting.mockImplementation(async (key) => key === "discord.rankedEnabled" ? true : "Europe/Paris");
  mocks.rules.mockResolvedValue(DEFAULT_RANKED_RULES);
  mocks.closed.mockResolvedValue([{ id: "s4" }]);
  mocks.jobs.mockResolvedValue([{ key: "season:s4", season: { leaderboardSnapshot: snapshot } }]);
  mocks.image.mockImplementation(async () => new Response(new Uint8Array([137, 80, 78, 71])));
  mocks.publish.mockResolvedValue({ ok: true, messageId: "message" });
});

describe("relais des bilans de saison", () => {
  it("clôt si nécessaire, puis publie uniquement le bilan conservé", async () => {
    expect(await syncDiscordSeasons()).toEqual({ published: 1, failed: 0 });
    expect(mocks.roll).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({ data: [{ key: "season:s4", seasonId: "s4", channelId: "ranked" }], skipDuplicates: true });
    expect(mocks.image).toHaveBeenCalledWith(snapshot);
    expect(mocks.publish).toHaveBeenCalledWith("season:s4", expect.objectContaining({ content: expect.stringContaining("Début de la saison 5") }), null, false, {
      mentionRoleId: "fighter", attachment: { filename: "kiraku-saison-4.png", data: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" },
    });
  });
  it("distingue les saisons pour la récupération d'un envoi incertain", () => {
    expect(seasonMessage(snapshot).embeds![0].url).toBe("https://kiraku.example/classement?vue=classe&bilan=4");
    expect(seasonMessage({ ...snapshot, number: 5, nextNumber: 6 }).embeds![0].url).not.toBe(seasonMessage(snapshot).embeds![0].url);
  });
  it("n'envoie rien tant que le relais est désactivé", async () => {
    mocks.setting.mockResolvedValue(false);
    expect(await syncDiscordSeasons()).toEqual({ published: 0, failed: 0 });
    expect(mocks.closed).not.toHaveBeenCalled();
    expect(mocks.roll).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("n'invente pas de bilan pour les saisons closes avant cette mise à jour", async () => {
    mocks.closed.mockResolvedValue([]);
    mocks.jobs.mockResolvedValue([]);
    await syncDiscordSeasons();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("respecte le budget du cron et garde les travaux pour le prochain passage", async () => {
    await syncDiscordSeasons(Date.now() + 1000);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("reporte une erreur de rendu sans publier de message incomplet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.image.mockRejectedValueOnce(new Error("private"));
    expect(await syncDiscordSeasons()).toEqual({ published: 0, failed: 1 });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nextAttemptAt: expect.any(Date) } }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    warn.mockRestore();
  });
});
