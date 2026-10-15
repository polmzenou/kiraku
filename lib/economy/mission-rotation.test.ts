import { describe, expect, it } from "vitest";
import { MISSION_SEEDS } from "@/prisma/seed/economy";
import { missionInputSchema, MISSION_PERIODS } from "./missions";
import { missionDifficulty, selectMissionRotation, type RotationMission } from "./mission-rotation";

const catalogue = MISSION_SEEDS.map((m) => ({ ...m, id: m.key, rarity: m.rarity ?? null }));
const NOW = new Date("2026-10-15T12:00:00Z");
const TZ = "Europe/Paris";
const DAY = 86_400_000;
const keys = (at: Date, period: "DAILY" | "WEEKLY") => selectMissionRotation(catalogue, at, TZ).filter((m) => m.period === period).map((m) => m.key);

describe("rotation des missions", () => {
  it("propose 5 missions de chaque période avec 2 faciles, 2 intermédiaires et 1 difficile", () => {
    for (let day = 0; day < 100; day++) {
      const selected = selectMissionRotation(catalogue, new Date(NOW.getTime() + day * DAY), TZ);
      for (const period of MISSION_PERIODS) {
        const group = selected.filter((m) => m.period === period);
        expect(group).toHaveLength(5);
        expect(group.filter((m) => missionDifficulty(m) === "EASY")).toHaveLength(2);
        expect(group.filter((m) => missionDifficulty(m) === "MEDIUM")).toHaveLength(2);
        expect(group.filter((m) => missionDifficulty(m) === "HARD")).toHaveLength(1);
        expect(new Set(group.map((m) => m.metric)).size).toBe(5);
      }
    }
  });

  it("reste identique au rechargement, quel que soit l'ordre retourné par la base", () => {
    expect(selectMissionRotation([...catalogue].reverse(), NOW, TZ)).toEqual(selectMissionRotation(catalogue, NOW, TZ));
    expect(keys(new Date("2026-10-15T00:10:00Z"), "DAILY")).toEqual(keys(new Date("2026-10-15T21:59:59Z"), "DAILY"));
  });

  it("renouvelle les quotidiennes à minuit local et les hebdomadaires le lundi seulement", () => {
    expect(keys(new Date("2026-10-15T22:00:00Z"), "DAILY")).not.toEqual(keys(new Date("2026-10-15T21:59:59Z"), "DAILY"));
    expect(keys(new Date("2026-10-18T21:59:59Z"), "WEEKLY")).toEqual(keys(NOW, "WEEKLY"));
    expect(keys(new Date("2026-10-18T22:00:00Z"), "WEEKLY")).not.toEqual(keys(NOW, "WEEKLY"));
    expect(keys(new Date("2026-10-15T22:00:00Z"), "WEEKLY")).toEqual(keys(NOW, "WEEKLY"));
  });

  it("garde la même sélection lors de l'heure répétée en hiver et autour du nouvel an ISO", () => {
    expect(keys(new Date("2026-10-25T00:30:00Z"), "DAILY")).toEqual(keys(new Date("2026-10-25T01:30:00Z"), "DAILY"));
    expect(keys(new Date("2026-12-31T12:00:00Z"), "WEEKLY")).toEqual(keys(new Date("2027-01-03T12:00:00Z"), "WEEKLY"));
    expect(keys(new Date("2027-01-04T12:00:00Z"), "WEEKLY")).not.toEqual(keys(new Date("2027-01-03T12:00:00Z"), "WEEKLY"));
  });

  it("fait tourner tout le catalogue sans répéter la même sélection deux périodes de suite", () => {
    const seen = new Set<string>();
    for (const period of MISSION_PERIODS) {
      let previous: string[] = [];
      for (let index = 0; index < 120; index++) {
        const selected = keys(new Date(NOW.getTime() + index * DAY * (period === "WEEKLY" ? 7 : 1)), period);
        expect([...selected].sort()).not.toEqual([...previous].sort());
        selected.forEach((key) => seen.add(key));
        previous = selected;
      }
    }
    expect([...seen].sort()).toEqual(catalogue.map((m) => m.key).sort());
  });

  it("fonctionne avec un petit pool ou des difficultés désactivées, sans doublons", () => {
    expect(selectMissionRotation([], NOW, TZ)).toEqual([]);
    expect(selectMissionRotation(catalogue.filter((m) => m.period === "DAILY").slice(0, 3), NOW, TZ)).toHaveLength(3);
    const easy = catalogue.filter((m) => missionDifficulty(m) === "EASY");
    for (const period of MISSION_PERIODS) {
      const selected = selectMissionRotation(easy, NOW, TZ).filter((m) => m.period === period);
      expect(selected).toHaveLength(5);
      expect(new Set(selected.map((m) => m.id)).size).toBe(5);
    }
  });

  it("valide les données de départ et les classe dans le palier récompensé", () => {
    expect(new Set(catalogue.map((m) => m.key)).size).toBe(catalogue.length);
    for (const mission of catalogue) {
      const { id: _id, ...data } = mission;
      void _id;
      expect(missionInputSchema.safeParse({ ...data, title: null, active: true, sortOrder: 0 }).success).toBe(true);
      if (mission.lotId.includes("daily-") || mission.lotId.includes("weekly-")) {
        expect(mission.lotId.endsWith(missionDifficulty(mission).toLowerCase())).toBe(true);
      }
    }
  });

  it("classe les missions personnalisées selon le temps disponible et la rareté", () => {
    const m: RotationMission = { id: "m", key: "m", period: "DAILY", metric: "OPEN_BOOSTERS", goal: 20, rarity: null };
    expect(missionDifficulty(m)).toBe("HARD");
    expect(missionDifficulty({ ...m, period: "WEEKLY" })).toBe("EASY");
    expect(missionDifficulty({ ...m, metric: "PULL_RARITY", rarity: "MYTHIC", goal: 1 })).toBe("HARD");
  });
});
