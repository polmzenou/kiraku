import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchedBan } from "./network-ban-core";

// noteBlocked : déclencheur du suivi d'un appareil banni et compteurs de la liste des bans (passages, appareils
// bloqués). Base, réglages, limitation et cœur des bans simulés.

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findSignal: vi.fn(),
  executeRaw: vi.fn(),
  rateLimit: vi.fn(),
  getSetting: vi.fn(),
  follow: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("../db", () => ({
  prisma: { networkBan: { updateMany: mocks.updateMany }, userSignal: { findFirst: mocks.findSignal }, $executeRaw: mocks.executeRaw },
}));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit, clientIp: vi.fn() }));
vi.mock("../settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("./network-ban-core", () => ({ findNetworkBans: vi.fn(), followDeviceWith: mocks.follow }));
vi.mock("./signals", () => ({ DEVICE_COOKIE: { name: "kiraku.device" } }));

import { blockingBan, noteBlocked, type RequestBan } from "./network-ban";

const DEVICE = "0123456789abcdef0123456789abcdef";
const TAG = createHash("sha256").update(DEVICE).digest("hex").slice(0, 12);
const SETTINGS: Record<string, unknown> = {
  "multiAccount.followDevice": true,
  "multiAccount.followDeviceIpv4": true,
  "multiAccount.autoBanMaxOthers": 0,
  "multiAccount.autoBanDays": 30,
  "multiAccount.autoBanPerDevice": 5,
};

const matched = (id: string, kind: "IP" | "DEVICE", deviceTags: string[] = []): MatchedBan => ({
  id,
  kind,
  reason: "triche",
  userId: "cheater",
  createdById: "admin",
  createdAt: new Date("2026-11-20T10:00:00Z"),
  deviceTags,
});
const request = (bans: MatchedBan[], over: Partial<RequestBan> = {}): RequestBan => ({ bans, ipKey: "86.245.12.3", device: DEVICE, since: bans[0].createdAt, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getSetting.mockImplementation(async (key: string) => SETTINGS[key]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findSignal.mockResolvedValue({ id: "s1" });
  mocks.executeRaw.mockResolvedValue(1);
  mocks.follow.mockResolvedValue("FOLLOW");
});

describe("ban réseau d'une requête", () => {
  it("laisse passer l'équipe, sans dire qu'il n'y a pas de ban", () => {
    const ban = request([matched("d1", "DEVICE")]);
    expect(blockingBan(ban, "USER")).toBe(ban);
    expect(blockingBan(ban, "ADMIN")).toBeNull();
    expect(blockingBan(ban, "DEV")).toBeNull();
    expect(blockingBan(null, "USER")).toBeNull();
  });
});

describe("noteBlocked", () => {
  it("compte un passage par 10 minutes et par réseau", async () => {
    await noteBlocked(request([matched("ip2", "IP", [TAG]), matched("ip1", "IP", [TAG])]));
    expect(mocks.rateLimit).toHaveBeenCalledWith("netban:ip1,ip2:86.245.12.3", { limit: 1, windowSeconds: 600 }, { store: "memory" });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["ip1", "ip2"] } }, data: { hits: { increment: 1 }, lastHitAt: expect.any(Date) } });
  });

  it("déjà compté dans la fenêtre : ni passage ni suivi", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    await noteBlocked(request([matched("d1", "DEVICE")]));
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it("un appareil banni sur une IP qui ne l'est pas fait suivre le ban, avec les réglages", async () => {
    const deviceBan = matched("d1", "DEVICE");
    await noteBlocked(request([deviceBan]));
    expect(mocks.follow).toHaveBeenCalledWith(
      expect.anything(),
      { deviceBan, device: DEVICE, ipKey: "86.245.12.3", now: expect.any(Date) },
      { enabled: true, ipv4: true, maxOthers: 0, days: 30, perDevice: 5 },
    );
  });

  it("pas de suivi sans appareil banni, sans cookie, sans IP, ou quand l'IP est déjà bannie", async () => {
    await noteBlocked(request([matched("ip1", "IP", [TAG])]));
    await noteBlocked(request([matched("d1", "DEVICE")], { device: null }));
    await noteBlocked(request([matched("d1", "DEVICE")], { ipKey: null }));
    await noteBlocked(request([matched("d1", "DEVICE"), matched("ip1", "IP", [TAG])]));
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(4);
  });

  it("note une fois chaque appareil connu bloqué par un ban d'IP", async () => {
    await noteBlocked(request([matched("ip1", "IP"), matched("d1", "DEVICE")]));
    expect(mocks.findSignal).toHaveBeenCalledWith({ where: { kind: "DEVICE", value: DEVICE }, select: { id: true } });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    const [, tag, ids] = mocks.executeRaw.mock.calls[0];
    expect(tag).toBe(TAG);
    expect(ids).toEqual(["ip1"]);
  });

  it("n'écrit rien pour un appareil déjà compté, un ban plein, un cookie inconnu ou absent", async () => {
    await noteBlocked(request([matched("ip1", "IP", [TAG])]));
    await noteBlocked(request([matched("ip1", "IP", Array.from({ length: 20 }, (_, i) => `t${i}`))]));
    await noteBlocked(request([matched("ip1", "IP")], { device: null }));
    expect(mocks.findSignal).not.toHaveBeenCalled();
    mocks.findSignal.mockResolvedValue(null);
    await noteBlocked(request([matched("ip1", "IP")]));
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("ne lève jamais : un échec finit dans les logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateMany.mockRejectedValue(new Error("base indisponible"));
    await expect(noteBlocked(request([matched("d1", "DEVICE")]))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
