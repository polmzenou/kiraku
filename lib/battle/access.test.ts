import { describe, expect, it } from "vitest";
import { replaySeed, requeueTeam } from "./access";

const KEY = "ab".repeat(32);

describe("replaySeed", () => {
  it("rien tant que la partie se joue (ni la graine, ni la clé)", () => {
    for (const status of ["WAITING", "ACTIVE", "CANCELLED"]) {
      expect(replaySeed({ status, seed: 123, rngKey: null })).toBe(0);
      expect(replaySeed({ status, seed: 0, rngKey: KEY })).toBe(0);
    }
  });

  it("une fois terminée : la clé v2, ou la graine d'une partie d'avant la clé", () => {
    expect(replaySeed({ status: "FINISHED", seed: 0, rngKey: KEY })).toBe(KEY);
    expect(replaySeed({ status: "FINISHED", seed: 123, rngKey: null })).toBe(123);
  });
});

describe("requeueTeam", () => {
  const base = { mode: "RANKED" as const, status: "FINISHED", p1Id: "a", p2Id: "b", p1Team: ["a1", "a2", "a3"], p2Team: ["b1", "b2", "b3"] };

  it("l'équipe du joueur, de son côté de la partie", () => {
    expect(requeueTeam(base, "a")).toEqual({ mode: "RANKED", team: ["a1", "a2", "a3"] });
    expect(requeueTeam(base, "b")).toEqual({ mode: "RANKED", team: ["b1", "b2", "b3"] });
  });

  it("refuse la partie d'un autre joueur, une partie entre amis ou pas terminée", () => {
    expect(requeueTeam(base, "c")).toBeNull();
    expect(requeueTeam({ ...base, mode: "FRIEND" }, "a")).toBeNull();
    expect(requeueTeam({ ...base, status: "ACTIVE" }, "a")).toBeNull();
  });

  it("contre le bot (p2 nul), seul le joueur relance", () => {
    expect(requeueTeam({ ...base, mode: "EXHIBITION", p2Id: null, p2Team: [] }, "a")).toEqual({ mode: "EXHIBITION", team: ["a1", "a2", "a3"] });
  });
});
