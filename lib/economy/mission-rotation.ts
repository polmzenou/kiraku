import { filterContext } from "@/lib/boosters/pool-filter";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { MISSION_PERIODS, type MissionMetric, type MissionPeriod } from "./missions";

export const MISSION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type MissionDifficulty = (typeof MISSION_DIFFICULTIES)[number];
export const MISSIONS_PER_PERIOD = 5;
const SLOTS: Record<MissionDifficulty, number> = { EASY: 2, MEDIUM: 2, HARD: 1 };

export type RotationMission = {
  id: string;
  key: string;
  period: MissionPeriod;
  metric: MissionMetric;
  goal: number;
  rarity: Rarity | null;
};

/** Difficulté relative à la durée disponible, y compris pour les missions créées dans l'admin. */
export function missionDifficulty(mission: Pick<RotationMission, "period" | "metric" | "goal" | "rarity">): MissionDifficulty {
  const weekly = mission.period === "WEEKLY";
  let limits: readonly [easy: number, medium: number];
  switch (mission.metric) {
    case "VISIT": return "EASY";
    case "OPEN_BOOSTERS": limits = weekly ? [20, 60] : [5, 12]; break;
    case "DISCOVER_CARDS": limits = weekly ? [10, 30] : [3, 10]; break;
    case "RECYCLE_ZENI": limits = weekly ? [150, 500] : [30, 100]; break;
    case "SPEND_ZENI": limits = weekly ? [1_000, 3_000] : [200, 600]; break;
    case "SEND_GIFTS": limits = weekly ? [2, 7] : [0, 1]; break;
    case "ADD_FRIENDS": limits = weekly ? [1, 3] : [1, 1]; break;
    case "PULL_RARITY": {
      const rarity = RARITIES.indexOf(mission.rarity ?? "COMMON");
      if (rarity >= RARITIES.indexOf("LEGENDARY")) return "HARD";
      if (rarity >= RARITIES.indexOf("EPIC")) limits = weekly ? [0, 4] : [0, 1];
      else if (rarity >= RARITIES.indexOf("RARE")) limits = weekly ? [12, 35] : [1, 8];
      else limits = weekly ? [30, 80] : [5, 15];
      break;
    }
  }
  return mission.goal <= limits[0] ? "EASY" : mission.goal <= limits[1] ? "MEDIUM" : "HARD";
}

/** Jour civil et semaine du lundi : pas de saut de sélection aux changements d'heure. */
function rotationIndex(period: MissionPeriod, now: Date, timeZone: string): number {
  const { year, month, day } = filterContext(now, timeZone);
  const days = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return period === "DAILY" ? days : Math.floor((days + 3) / 7);
}

function cycle<T>(values: readonly T[], index: number, step: number): T[] {
  if (values.length === 0) return [];
  const start = ((index * step) % values.length + values.length) % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

/**
 * Même sélection pour tous, stable pendant la période, sans cron ni hasard au rechargement.
 * Deux faciles, deux intermédiaires et un défi ; les autres paliers complètent un pool réduit.
 * Chaque type d'activité n'apparaît qu'une fois tant que le catalogue offre assez de variété.
 */
export function selectMissionRotation<T extends RotationMission>(missions: readonly T[], now: Date, timeZone: string): T[] {
  return MISSION_PERIODS.flatMap((period) => {
    const pool = missions.filter((m) => m.period === period).sort((a, b) => a.key.localeCompare(b.key, "en"));
    if (pool.length <= MISSIONS_PER_PERIOD) return pool;
    const index = rotationIndex(period, now, timeZone);
    const picked: T[] = [];
    const usedMetrics = new Set<MissionMetric>();
    const add = (candidates: readonly T[], count: number) => {
      const fresh = candidates.filter((m) => !picked.some((p) => p.id === m.id));
      const diverse = [...fresh.filter((m) => !usedMetrics.has(m.metric)), ...fresh.filter((m) => usedMetrics.has(m.metric))];
      let added = 0;
      // La liste est réévaluée après chaque choix pour ne pas doubler une activité du même palier.
      while (added < count) {
        const next = diverse.find((m) => !picked.some((p) => p.id === m.id) && !usedMetrics.has(m.metric))
          ?? diverse.find((m) => !picked.some((p) => p.id === m.id));
        if (!next) break;
        picked.push(next);
        usedMetrics.add(next.metric);
        added++;
      }
    };
    for (const difficulty of MISSION_DIFFICULTIES) {
      const candidates = pool.filter((m) => missionDifficulty(m) === difficulty);
      add(cycle(candidates, index, SLOTS[difficulty]), SLOTS[difficulty]);
    }
    add(cycle(pool, index, MISSIONS_PER_PERIOD), MISSIONS_PER_PERIOD - picked.length);
    return picked;
  });
}
