import { beforeEach, describe, expect, it, vi } from "vitest";

const CHANNEL = "1565800000000000002";
const state = vi.hoisted(() => ({ enabled: true }));
const db = vi.hoisted(() => ({
  post: { findMany: vi.fn(), createMany: vi.fn() },
  cycle: { findMany: vi.fn(), findUnique: vi.fn() },
  pull: { findMany: vi.fn(), findUnique: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn());
const drop = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { discordPost: db.post, prestigeCycle: db.cycle, notablePull: db.pull } }));
vi.mock("../env", () => ({ appUrl: () => "https://kiraku.example", discordPrestigeConfigured: true, env: { DISCORD_PRESTIGE_CHANNEL_ID: "1565800000000000002" } }));
vi.mock("../settings", () => ({ getSetting: async () => state.enabled }));
vi.mock("../prestige/rules", () => ({ getPrintingSeals: async () => [] }));
vi.mock("./labels", () => ({ discordPlayerName: (p: { username: string }) => p.username, discordPlayerSelect: {} }));
vi.mock("./posts", () => ({ publishDiscordPost: publish, dropDiscordPost: drop }));
import { syncDiscordPrestige } from "./prestige";

const HOUR = 3_600_000;
let queued: { key: string }[];
let due: { key: string }[];

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  queued = [];
  due = [];
  // Première lecture : clés déjà en file dans la fenêtre ; seconde : annonces dues
  db.post.findMany.mockImplementation(async ({ where }: { where: { createdAt?: unknown } }) => (where.createdAt ? queued : due));
  db.cycle.findMany.mockResolvedValue([]);
  db.pull.findMany.mockResolvedValue([]);
  publish.mockResolvedValue({ ok: true, messageId: "123456789012345678" });
});

describe("annonces du prestige sur Discord", () => {
  it("met en file renaissances et gravées des six dernières heures, une clé chacune", async () => {
    db.cycle.findMany.mockResolvedValue([{ id: "c2" }]);
    db.pull.findMany.mockResolvedValue([{ id: "p2" }]);
    await syncDiscordPrestige();
    const since = db.cycle.findMany.mock.calls[0][0].where.createdAt.gte.getTime();
    expect(Date.now() - since).toBeGreaterThanOrEqual(6 * HOUR - 1000);
    expect(db.pull.findMany.mock.calls[0][0].where).toMatchObject({ printing: { not: null } });
    expect(db.post.createMany).toHaveBeenCalledWith({
      data: [{ key: "prestige:rebirth:c2", channelId: CHANNEL }, { key: "prestige:engraved:p2", channelId: CHANNEL }],
      skipDuplicates: true,
    });
  });
  it("écarte les événements déjà en file : les suivants ne restent pas bloqués derrière les vingt plus anciens", async () => {
    queued = [{ key: "prestige:rebirth:c1" }, { key: "prestige:engraved:p1" }, { key: "prestige:rebirth:c3" }];
    await syncDiscordPrestige();
    expect(db.post.findMany.mock.calls[0][0].where).toMatchObject({ key: { startsWith: "prestige:" } });
    expect(db.cycle.findMany.mock.calls[0][0].where.id).toEqual({ notIn: ["c1", "c3"] });
    expect(db.pull.findMany.mock.calls[0][0].where.id).toEqual({ notIn: ["p1"] });
    expect(db.post.createMany).not.toHaveBeenCalled();
  });
  it("abandonne une renaissance disparue avant son envoi", async () => {
    due = [{ key: "prestige:rebirth:c9" }];
    db.cycle.findUnique.mockResolvedValue(null);
    expect(await syncDiscordPrestige()).toEqual({ relayed: 0, failed: 1 });
    expect(drop).toHaveBeenCalledWith("prestige:rebirth:c9");
    expect(publish).not.toHaveBeenCalled();
  });
  it("publie une renaissance relue en base, sans date de relecture", async () => {
    due = [{ key: "prestige:rebirth:c4" }];
    db.cycle.findUnique.mockResolvedValue({ number: 2, globalRank: 7, heirs: [], user: { id: "u", username: "Sakura", profileVisibility: "PUBLIC", bannedAt: null, anonymizedAt: null } });
    expect(await syncDiscordPrestige()).toEqual({ relayed: 1, failed: 0 });
    expect(publish).toHaveBeenCalledWith("prestige:rebirth:c4", expect.any(Object), null);
  });
  it("reste muet tant que l'annonce est coupée", async () => {
    state.enabled = false;
    expect(await syncDiscordPrestige()).toEqual({ relayed: 0, failed: 0 });
    expect(db.post.findMany).not.toHaveBeenCalled();
  });
});
