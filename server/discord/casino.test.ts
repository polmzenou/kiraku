import { beforeEach, describe, expect, it, vi } from "vitest";

const CHANNEL = "1565800000000000001";
const state = vi.hoisted(() => ({ enabled: true, opensAt: 0 as number | null }));
const db = vi.hoisted(() => ({
  post: { findUnique: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  flip: { findUnique: vi.fn(), findMany: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn());
const drop = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => { throw new Error("absent"); }) }));
vi.mock("../db", () => ({ prisma: { discordPost: db.post, coinFlip: db.flip } }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordCasinoConfigured: true, env: { DISCORD_CASINO_CHANNEL_ID: "1565800000000000001", DISCORD_GUILD_ID: "1565773684243697905" } }));
vi.mock("../settings", () => ({ getSetting: async (key: string) => (key === "discord.casinoEnabled" ? state.enabled : "MYTHIC") }));
vi.mock("../casino/queries", () => ({ getCasinoRules: async () => ({ visible: true, opensAt: state.opensAt }) }));
vi.mock("../catalog/rarities", () => ({ getRarityDefinitions: async () => [{ key: "RARE", sortOrder: 2 }, { key: "MYTHIC", sortOrder: 5 }] }));
vi.mock("../home/event-gauge", () => ({ readEventGauge: async () => null }));
vi.mock("./labels", () => ({ copyLabelOf: async () => null, discordPlayerName: (p: { username: string }) => p.username, discordPlayerSelect: {} }));
vi.mock("./posts", () => ({ publishDiscordPost: publish, dropDiscordPost: drop }));
import { syncDiscordCasino } from "./casino";

const HOUR = 3_600_000;

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.opensAt = Date.now() - HOUR;
  db.post.findUnique.mockResolvedValue(null);
  db.post.findMany.mockResolvedValue([]);
  db.flip.findMany.mockResolvedValue([]);
  publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
});

describe("annonces du casino sur Discord", () => {
  it("publie l'ouverture une seule fois, sous une clé liée à sa date", async () => {
    expect((await syncDiscordCasino()).opening).toBe(true);
    const key = `casino:opening:${new Date(state.opensAt!).toISOString()}`;
    expect(db.post.createMany).toHaveBeenCalledWith({ data: [{ key, channelId: CHANNEL }], skipDuplicates: true });
    expect(publish).toHaveBeenCalledWith(key, expect.objectContaining({ embeds: expect.any(Array) }), null, false, {});
    // Déjà publiée : rien de plus au passage suivant
    publish.mockClear();
    db.post.findUnique.mockResolvedValue({ messageId: "123456789012345678", nextAttemptAt: null });
    expect((await syncDiscordCasino()).opening).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
  it("n'annonce plus une ouverture passée depuis plus de 24 h, ni avant l'heure", async () => {
    state.opensAt = Date.now() - 25 * HOUR;
    await syncDiscordCasino();
    state.opensAt = Date.now() + HOUR;
    await syncDiscordCasino();
    expect(db.post.findUnique).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it("attend le délai d'une ouverture en échec", async () => {
    db.post.findUnique.mockResolvedValue({ messageId: null, nextAttemptAt: new Date(Date.now() + 60_000) });
    expect((await syncDiscordCasino()).opening).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
  it("met en file les gros lancers des six dernières heures, pas encore en file", async () => {
    db.flip.findMany.mockResolvedValue([{ id: "f2" }]);
    await syncDiscordCasino();
    const where = db.flip.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "DONE", creatorRarity: { in: ["MYTHIC"] }, discordPost: { is: null } });
    expect(Date.now() - where.resolvedAt.gte.getTime()).toBeGreaterThanOrEqual(6 * HOUR - 1000);
    expect(db.post.createMany).toHaveBeenCalledWith({ data: [{ key: "coinflip:f2", coinFlipId: "f2", channelId: CHANNEL }], skipDuplicates: true });
  });
  it("abandonne le relais d'un lancer qui n'est pas terminé", async () => {
    state.opensAt = null;
    db.post.findMany.mockResolvedValue([{ key: "coinflip:f1", coinFlipId: "f1" }]);
    db.flip.findUnique.mockResolvedValue({ id: "f1", status: "CANCELLED", result: null, opponent: null, opponentCard: null });
    expect(await syncDiscordCasino()).toEqual({ opening: false, relayed: 0, failed: 1 });
    expect(drop).toHaveBeenCalledWith("coinflip:f1");
    expect(publish).not.toHaveBeenCalled();
  });
  it("reste muet tant que l'annonce est coupée", async () => {
    state.enabled = false;
    expect(await syncDiscordCasino()).toEqual({ opening: false, relayed: 0, failed: 0 });
    expect(db.flip.findMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
