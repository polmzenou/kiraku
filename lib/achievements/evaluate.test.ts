import { describe, expect, it } from "vitest";
import { achievementByKey, type AchievementDef } from "./catalog";
import {
  activeAchievements,
  effectiveGoal,
  evaluateAchievement,
  evaluateAll,
  freshUnlocks,
  isReached,
  metricOf,
  neededStats,
  normalizeGoals,
  type AchievementStats,
} from "./evaluate";

const get = (key: string): AchievementDef => {
  const a = achievementByKey(key);
  if (!a) throw new Error(key);
  return a;
};
const stats = (values: Record<string, number>, goals: Record<string, number> = {}): AchievementStats => ({
  values: new Map(Object.entries(values)),
  goals: new Map(Object.entries(goals)),
});

describe("isReached", () => {
  it("compte, palier et event : au moins le seuil", () => {
    expect(isReached("count", 49, 50)).toBe(false);
    expect(isReached("count", 50, 50)).toBe(true);
    expect(isReached("level", 3, 3)).toBe(true);
    expect(isReached("event", 0, 1)).toBe(false);
  });
  it("flag : fait ou pas", () => {
    expect(isReached("flag", 0, 1)).toBe(false);
    expect(isReached("flag", 1, 1)).toBe(true);
  });
  it("place : au plus le seuil, jamais classé ne compte pas", () => {
    expect(isReached("position", 0, 100)).toBe(false);
    expect(isReached("position", 101, 100)).toBe(false);
    expect(isReached("position", 100, 100)).toBe(true);
    expect(isReached("position", 1, 10)).toBe(true);
  });
});

describe("evaluateAchievement", () => {
  it("compteur : barre plafonnée au seuil", () => {
    const p = evaluateAchievement(get("booster-50"), 50, 20, null);
    expect(p).toMatchObject({ unlocked: false, current: 20, goal: 50, ratio: 0.4 });
    expect(evaluateAchievement(get("booster-50"), 50, 500, null)).toMatchObject({ unlocked: true, current: 50, ratio: 1 });
  });

  it("un déblocage enregistré reste acquis sous le seuil (vente, seuil relevé)", () => {
    const at = new Date("2026-11-01T00:00:00Z");
    expect(evaluateAchievement(get("copies-10"), 10, 2, at)).toMatchObject({ unlocked: true, unlockedAt: at, current: 10, ratio: 1 });
    expect(evaluateAchievement(get("tier-elite"), 5, 1, at)).toMatchObject({ unlocked: true, current: 1, goal: 1 });
  });

  it("palier du classé : affiché comme fait ou pas", () => {
    expect(evaluateAchievement(get("tier-gold"), 3, 2, null)).toMatchObject({ unlocked: false, current: 0, goal: 1, ratio: 0 });
    expect(evaluateAchievement(get("tier-gold"), 3, 4, null)).toMatchObject({ unlocked: true, current: 1, goal: 1 });
  });

  it("place : la barre suit le rapport seuil / meilleure place", () => {
    expect(evaluateAchievement(get("season-top-100"), 100, 0, null)).toMatchObject({ unlocked: false, ratio: 0, best: 0 });
    expect(evaluateAchievement(get("season-top-100"), 100, 200, null)).toMatchObject({ unlocked: false, ratio: 0.5, best: 200 });
    expect(evaluateAchievement(get("season-top-10"), 10, 7, null)).toMatchObject({ unlocked: true, ratio: 1 });
  });

  it("event : verrouillé tant que le crochet ne l'a pas enregistré", () => {
    expect(evaluateAchievement(get("wish-granted"), 1, 0, null).unlocked).toBe(false);
    expect(evaluateAchievement(get("wish-granted"), 1, 0, new Date()).unlocked).toBe(true);
  });
});

describe("effectiveGoal", () => {
  it("seuil réglé dans l'admin pour un succès réglable", () => {
    expect(effectiveGoal(get("booster-50"), { "booster-50": 80 })).toBe(80);
  });
  it("seuil figé : le réglage est ignoré", () => {
    expect(effectiveGoal(get("tier-gold"), { "tier-gold": 1 })).toBe(3);
    expect(effectiveGoal(get("season-first"), { "season-first": 5 })).toBe(1);
  });
  it("seuil imposé par les données, prioritaire", () => {
    expect(effectiveGoal(get("all-variants"), {}, stats({}, { ALL_VARIANTS: 8 }))).toBe(8);
  });
  it("réglage invalide : retombe sur le catalogue", () => {
    expect(effectiveGoal(get("booster-50"), { "booster-50": 0 })).toBe(50);
    expect(effectiveGoal(get("booster-50"), { "booster-50": 2.5 })).toBe(50);
  });
});

describe("normalizeGoals", () => {
  it("garde les seuils réglables qui changent du catalogue", () => {
    expect(normalizeGoals({ "booster-50": 80, "booster-250": 250, "tier-gold": 2, inconnu: 3 })).toEqual({ "booster-50": 80 });
  });
});

describe("evaluateAll, neededStats et freshUnlocks", () => {
  const defs = [get("booster-1"), get("booster-50"), get("first-xr"), get("wish-granted")];

  it("lit la statistique de chaque succès (paramètre compris)", () => {
    const progress = evaluateAll(defs, stats({ OPENINGS: 12, "RARITY:XR": 1 }), new Map(), {});
    expect(progress.map((p) => [p.key, p.unlocked])).toEqual([
      ["booster-1", true],
      ["booster-50", false],
      ["first-xr", true],
      ["wish-granted", false],
    ]);
    expect(freshUnlocks(progress)).toEqual(["booster-1", "first-xr"]);
  });

  it("ne recalcule ni les succès enregistrés ni les events", () => {
    const stored = new Map([["booster-1", new Date()]]);
    expect([...neededStats(defs, stored)].sort()).toEqual(["OPENINGS", "RARITY:XR"]);
    expect(freshUnlocks(evaluateAll(defs, stats({ OPENINGS: 1 }), stored, {}))).toEqual([]);
  });

  it("metricOf retire le paramètre", () => {
    expect(metricOf("RARITY:XR")).toBe("RARITY");
    expect(metricOf("OPENINGS")).toBe("OPENINGS");
  });
});

describe("activeAchievements", () => {
  it("écarte les succès désactivés", () => {
    const keys = activeAchievements(["booster-1", "jackpot"]).map((a) => a.key);
    expect(keys).not.toContain("booster-1");
    expect(keys).not.toContain("jackpot");
    expect(keys).toContain("booster-50");
  });
});
