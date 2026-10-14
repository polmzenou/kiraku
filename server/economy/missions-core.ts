// Missions : état du joueur et réclamation atomique. Client Prisma injecté (serveur ou test).
// Réclamer : verrou User → mission relue → progression recalculée sous verrou → UserMission (la
// clé primaire interdit la double réclamation) → lot versé, dans la même transaction.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Rarity } from "@/lib/catalog/rarity";
import {
  measureKey,
  missionRefId,
  missionState,
  type MissionMetric,
  type MissionPeriod,
  type MissionState,
} from "@/lib/economy/missions";
import { periodWindow, type PeriodWindow } from "@/lib/economy/period";
import { lockPlayers } from "../social/lock";
import { grantLot, type LotDeps, type LotGrant } from "./lots";
import { measureProgress } from "./mission-progress";

export type MissionErrorCode = "NO_USER" | "BANNED" | "NOT_FOUND" | "NOT_DONE" | "ALREADY_CLAIMED";

export class MissionError extends Error {
  constructor(readonly code: MissionErrorCode) {
    super(code);
  }
}

export type PlayerMission = {
  id: string;
  key: string;
  period: MissionPeriod;
  metric: MissionMetric;
  goal: number;
  rarity: Rarity | null;
  title: unknown;
  lotId: string;
  progress: number;
  state: MissionState;
  periodKey: string;
  endsAt: Date;
};

const TX = { maxWait: 10_000, timeout: 20_000 };

/** Missions actives et où en est le joueur, période en cours. Deux missions qui mesurent la même chose partagent le calcul. */
export async function playerMissionsWith(db: PrismaClient, userId: string, now: Date, timeZone: string): Promise<PlayerMission[]> {
  const missions = await db.mission.findMany({
    where: { active: true },
    orderBy: [{ period: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, key: true, period: true, metric: true, goal: true, rarity: true, title: true, lotId: true },
  });
  if (missions.length === 0) return [];

  const windows: Record<MissionPeriod, PeriodWindow> = {
    DAILY: periodWindow("DAILY", now, timeZone),
    WEEKLY: periodWindow("WEEKLY", now, timeZone),
  };
  const claims = await db.userMission.findMany({
    where: { userId, OR: (["DAILY", "WEEKLY"] as const).map((p) => ({ periodKey: windows[p].key, mission: { period: p } })) },
    select: { missionId: true },
  });
  const claimed = new Set(claims.map((c) => c.missionId));

  const measures = new Map<string, Promise<number>>();
  const progressOf = (m: (typeof missions)[number]) => {
    const key = measureKey({ metric: m.metric, period: m.period, rarity: m.rarity as Rarity | null });
    if (!measures.has(key)) {
      measures.set(key, measureProgress(db, userId, { metric: m.metric, rarity: m.rarity as Rarity | null }, windows[m.period]));
    }
    return measures.get(key)!;
  };

  return Promise.all(
    missions.map(async (m) => {
      const progress = await progressOf(m);
      return {
        ...m,
        rarity: m.rarity as Rarity | null,
        progress,
        state: missionState(progress, m.goal, claimed.has(m.id)),
        periodKey: windows[m.period].key,
        endsAt: windows[m.period].end,
      };
    }),
  );
}

export async function claimMissionWith(
  db: PrismaClient,
  input: { userId: string; missionId: string; now: Date; timeZone: string },
  deps: LotDeps,
): Promise<{ grant: LotGrant; periodKey: string }> {
  return db.$transaction(async (tx) => {
    // Verrou du joueur : ses réclamations passent l'une après l'autre
    const player = (await lockPlayers(tx, [input.userId])).get(input.userId);
    if (!player) throw new MissionError("NO_USER");
    if (player.bannedAt) throw new MissionError("BANNED");

    const mission = await tx.mission.findFirst({
      where: { id: input.missionId, active: true },
      select: { id: true, period: true, metric: true, goal: true, rarity: true, lotId: true },
    });
    if (!mission) throw new MissionError("NOT_FOUND");

    const window = periodWindow(mission.period, input.now, input.timeZone);
    const already = await tx.userMission.findUnique({
      where: { userId_missionId_periodKey: { userId: input.userId, missionId: mission.id, periodKey: window.key } },
      select: { userId: true },
    });
    if (already) throw new MissionError("ALREADY_CLAIMED");

    const progress = await measureProgress(tx, input.userId, { metric: mission.metric, rarity: mission.rarity as Rarity | null }, window);
    if (progress < mission.goal) throw new MissionError("NOT_DONE");

    await tx.userMission.create({
      data: { userId: input.userId, missionId: mission.id, periodKey: window.key, claimedAt: input.now },
    });
    const grant = await grantLot(
      tx,
      input.userId,
      mission.lotId,
      { reason: "MISSION", refId: missionRefId(mission.id, window.key) },
      deps,
      input.now,
    );
    return { grant, periodKey: window.key };
  }, TX);
}
