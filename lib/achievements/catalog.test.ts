import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEAL_GLYPHS } from "../seal-glyphs";
import { parseSetting } from "../settings/defaults";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, CATEGORY_KANJI, METRIC_KIND, RANK_SEAL, isAdjustable, metricKind, statKey } from "./catalog";

describe("catalogue des succès", () => {
  it("compte 156 succès aux clés uniques et courtes", () => {
    expect(ACHIEVEMENTS).toHaveLength(156);
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key, key).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("chaque succès a une catégorie, un rang, une métrique connue et un seuil positif", () => {
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_CATEGORIES, a.key).toContain(a.category);
      expect(RANK_SEAL[a.rank], a.key).toBeDefined();
      expect(METRIC_KIND[a.metric], a.key).toBeDefined();
      expect(Number.isInteger(a.goal) && a.goal >= 1, a.key).toBe(true);
      // Un flag ou un event vaut 1 : rien à régler
      if (metricKind(a) === "flag" || metricKind(a) === "event") {
        expect(a.goal, a.key).toBe(1);
        expect(isAdjustable(a), a.key).toBe(false);
      }
    }
  });

  it("deux succès d'une même statistique ont des seuils différents (paliers)", () => {
    const seen = new Map<string, Set<number>>();
    for (const a of ACHIEVEMENTS) {
      const goals = seen.get(statKey(a)) ?? new Set<number>();
      expect(goals.has(a.goal), a.key).toBe(false);
      goals.add(a.goal);
      seen.set(statKey(a), goals);
    }
  });

  it("chaque catégorie a son kanji dans la police des sceaux, comme les rangs", () => {
    for (const c of ACHIEVEMENT_CATEGORIES) expect(SEAL_GLYPHS, c).toContain(CATEGORY_KANJI[c]);
    for (const seal of Object.values(RANK_SEAL)) expect(SEAL_GLYPHS).toContain(seal);
    expect(SEAL_GLYPHS).toContain("実");
    expect(SEAL_GLYPHS).toContain("績");
  });

  it.each(["fr", "en"])("a un nom et une description en %s pour chaque succès et chaque catégorie", (locale) => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const items = messages.achievements.items as Record<string, { name?: string; desc?: string }>;
    for (const a of ACHIEVEMENTS) {
      expect(items[a.key]?.name, `${locale} ${a.key}`).toBeTruthy();
      expect(items[a.key]?.desc, `${locale} ${a.key}`).toBeTruthy();
    }
    expect(Object.keys(items).sort()).toEqual(ACHIEVEMENTS.map((a) => a.key).sort());
    for (const c of ACHIEVEMENT_CATEGORIES) expect(messages.achievements.categories[c], `${locale} ${c}`).toBeTruthy();
  });
});

describe("réglages des succès", () => {
  it("ignore une clé retirée du catalogue sans perdre les autres réglages", () => {
    expect(parseSetting("achievements.goals", { "booster-50": 80, disparu: 3 })).toEqual({ "booster-50": 80 });
    expect(parseSetting("achievements.disabled", ["jackpot", "disparu", "jackpot"])).toEqual(["jackpot"]);
  });

  it("retombe sur les défauts pour une valeur illisible", () => {
    expect(parseSetting("achievements.goals", { "booster-50": 0 })).toEqual({});
    expect(parseSetting("achievements.disabled", "jackpot")).toEqual([]);
  });
});
