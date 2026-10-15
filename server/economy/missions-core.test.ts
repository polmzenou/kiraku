import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { selectMissionRotation } from "@/lib/economy/mission-rotation";
import { periodWindow } from "@/lib/economy/period";
import { MISSION_SEEDS } from "@/prisma/seed/economy";
import type { LotDeps } from "./lots";

const mocks = vi.hoisted(() => ({ measure: vi.fn(), grant: vi.fn(), lock: vi.fn() }));
vi.mock("./mission-progress", () => ({ measureProgress: mocks.measure }));
vi.mock("./lots", () => ({ grantLot: mocks.grant }));
vi.mock("../social/lock", () => ({ lockPlayers: mocks.lock }));
import { claimMissionWith, playerMissionsWith } from "./missions-core";

const NOW = new Date("2026-10-15T12:00:00Z");
const TZ = "Europe/Paris";
const pool = MISSION_SEEDS.map((m) => ({ ...m, id: m.key, rarity: m.rarity ?? null, title: null }));
const deps: LotDeps = { rng: () => 0, loadPool: vi.fn() };
const findMissions = vi.fn();
const findClaims = vi.fn();
const findClaim = vi.fn();
const createClaim = vi.fn();
const db = {
  mission: { findMany: findMissions },
  userMission: { findMany: findClaims, findUnique: findClaim, create: createClaim },
  $transaction: (run: (tx: unknown) => Promise<unknown>) => run(db),
} as unknown as PrismaClient;

beforeEach(() => {
  vi.clearAllMocks();
  findMissions.mockResolvedValue(pool);
  findClaims.mockResolvedValue([]);
  findClaim.mockResolvedValue(null);
  createClaim.mockResolvedValue({});
  mocks.lock.mockResolvedValue(new Map([["player", { id: "player", bannedAt: null }]]));
  mocks.measure.mockResolvedValue(1_000_000);
  mocks.grant.mockResolvedValue({ zeni: 60 });
});

describe("missions proposées et récompenses", () => {
  it("affiche seulement les dix missions de la rotation avec leurs périodes et difficultés", async () => {
    const selected = selectMissionRotation(pool, NOW, TZ);
    findClaims.mockResolvedValue([{ missionId: selected[0].id }]);
    const result = await playerMissionsWith(db, "player", NOW, TZ);
    expect(result.map((m) => m.id)).toEqual(selected.map((m) => m.id));
    expect(result[0].state).toBe("CLAIMED");
    expect(result[1].state).toBe("CLAIMABLE");
    for (const mission of result) {
      const window = periodWindow(mission.period, NOW, TZ);
      expect(mission.periodKey).toBe(window.key);
      expect(mission.endsAt).toEqual(window.end);
      expect(mocks.measure).toHaveBeenCalledWith(db, "player", { metric: mission.metric, rarity: mission.rarity }, window);
    }
  });

  it("refuse un objectif actif mais absent de la rotation, avant toute récompense", async () => {
    const ids = new Set(selectMissionRotation(pool, NOW, TZ).map((m) => m.id));
    const hidden = pool.find((m) => !ids.has(m.id))!;
    await expect(claimMissionWith(db, { userId: "player", missionId: hidden.id, now: NOW, timeZone: TZ }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.measure).not.toHaveBeenCalled();
    expect(createClaim).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("refuse une ancienne mission après le renouvellement", async () => {
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    const next = new Set(selectMissionRotation(pool, tomorrow, TZ).map((m) => m.id));
    const expired = selectMissionRotation(pool, NOW, TZ).find((m) => !next.has(m.id))!;
    await expect(claimMissionWith(db, { userId: "player", missionId: expired.id, now: tomorrow, timeZone: TZ }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("recalcule la progression et verse le lot avec la référence de la période en cours", async () => {
    const mission = selectMissionRotation(pool, NOW, TZ)[0];
    const result = await claimMissionWith(db, { userId: "player", missionId: mission.id, now: NOW, timeZone: TZ }, deps);
    const window = periodWindow(mission.period, NOW, TZ);
    expect(mocks.lock).toHaveBeenCalledWith(db, ["player"]);
    expect(createClaim).toHaveBeenCalledWith({ data: { userId: "player", missionId: mission.id, periodKey: window.key, claimedAt: NOW } });
    expect(mocks.grant).toHaveBeenCalledWith(db, "player", mission.lotId, { reason: "MISSION", refId: `${mission.id}:${window.key}` }, deps, NOW);
    expect(result.periodKey).toBe(window.key);
  });

  it("ne verse rien si l'objectif n'est pas atteint ou a déjà été réclamé", async () => {
    const mission = selectMissionRotation(pool, NOW, TZ)[0];
    const input = { userId: "player", missionId: mission.id, now: NOW, timeZone: TZ };
    mocks.measure.mockResolvedValue(0);
    await expect(claimMissionWith(db, input, deps)).rejects.toMatchObject({ code: "NOT_DONE" });
    findClaim.mockResolvedValue({ userId: "player" });
    await expect(claimMissionWith(db, input, deps)).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
    expect(createClaim).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});
