import { describe, expect, it } from "vitest";
import { AI_CRAWLERS, productionRobotsRules } from "./robots";

describe("robots.txt", () => {
  const [ai, all] = productionRobotsRules();

  it("refuse tout le site aux robots d'IA", () => {
    expect(ai.userAgent).toEqual([...AI_CRAWLERS]);
    expect(ai.disallow).toBe("/");
  });

  it("laisse le wiki aux moteurs de recherche, sans ses filtres", () => {
    expect(all.userAgent).toBe("*");
    expect(all.allow).toBe("/");
    expect(all.disallow).toEqual(expect.arrayContaining(["/wiki?", "/en/wiki?", "/*?v="]));
    expect(all.disallow).not.toContain("/wiki");
    expect(all.disallow).not.toContain("/wiki/");
  });

  it("garde les pages privées fermées dans les deux langues", () => {
    for (const p of ["/api/", "/admin/", "/compte", "/collection", "/tirage/"]) {
      expect(all.disallow).toContain(p);
      expect(all.disallow).toContain(`/en${p}`);
    }
  });

  it("ne cite jamais Googlebot ni Bingbot parmi les robots refusés", () => {
    expect(AI_CRAWLERS).not.toContain("Googlebot");
    expect(AI_CRAWLERS).not.toContain("Bingbot");
  });
});
