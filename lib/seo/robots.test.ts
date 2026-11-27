import { describe, expect, it } from "vitest";
import { AI_CRAWLERS, productionRobotsRules, type RobotsRule } from "./robots";

/** Lecture de robots.txt façon Google (suivie aussi par Twitterbot) : la règle la plus longue l'emporte, Allow à égalité. */
function allowed(rule: RobotsRule, url: string): boolean {
  const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const matches = (pattern: string) => new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}`).test(url);
  const best = (patterns: string[]) => Math.max(-1, ...patterns.filter(matches).map((p) => p.length));
  return best(list(rule.allow)) >= best(list(rule.disallow));
}

describe("robots.txt", () => {
  const [ai, all] = productionRobotsRules();

  it("refuse tout le site aux robots d'IA", () => {
    expect(ai.userAgent).toEqual([...AI_CRAWLERS]);
    expect(ai.disallow).toBe("/");
  });

  it("laisse le wiki aux moteurs de recherche, sans ses filtres", () => {
    expect(all.userAgent).toBe("*");
    expect(all.allow).toContain("/");
    expect(all.disallow).toEqual(expect.arrayContaining(["/wiki?", "/en/wiki?", "/*?v="]));
    expect(all.disallow).not.toContain("/wiki");
    expect(all.disallow).not.toContain("/wiki/");
    expect(allowed(all, "/wiki/907")).toBe(true);
    expect(allowed(all, "/wiki?after=48")).toBe(false);
  });

  it("garde les pages privées fermées dans les deux langues", () => {
    for (const p of ["/api/", "/admin/", "/compte", "/collection", "/tirage/"]) {
      expect(all.disallow).toContain(p);
      expect(all.disallow).toContain(`/en${p}`);
    }
  });

  it("ferme les versions archivées des pages légales mais pas les images de partage (?v= dans les deux cas)", () => {
    expect(allowed(all, "/cgu?v=3")).toBe(false);
    expect(allowed(all, "/en/confidentialite?v=2")).toBe(false);
    for (const url of ["/og-image?v=2", "/en/og-image?v=2", "/og-image/parrainage/ABC123?v=2", "/en/og-image/parrainage/ABC123?v=2"]) {
      expect(allowed(all, url)).toBe(true);
    }
  });

  it("ne cite jamais Googlebot ni Bingbot parmi les robots refusés", () => {
    expect(AI_CRAWLERS).not.toContain("Googlebot");
    expect(AI_CRAWLERS).not.toContain("Bingbot");
  });
});
