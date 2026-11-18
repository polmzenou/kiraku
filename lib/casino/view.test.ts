import { describe, expect, it } from "vitest";
import { coreView, flipStats, outcomeFor, revealedSeed, sideOf, type CoinFlipRow } from "./view";

const SEED = "ab".repeat(32);
const row: CoinFlipRow = {
  id: "t1",
  status: "OPEN",
  creatorId: "a",
  creatorSide: "OMOTE",
  tierOrder: 500,
  reservedForId: null,
  opponentId: null,
  seed: SEED,
  seedHash: "cd".repeat(32),
  result: null,
  winnerId: null,
  createdAt: new Date("2026-12-05T12:00:00.000Z"),
  expiresAt: new Date("2026-12-06T12:00:00.000Z"),
  resolvedAt: null,
};
const done: CoinFlipRow = { ...row, status: "DONE", opponentId: "b", result: "URA", winnerId: "b", resolvedAt: new Date("2026-12-05T13:00:00.000Z") };

describe("graine", () => {
  it("cachée tant que la table n'est pas jouée", () => {
    for (const status of ["OPEN", "CANCELLED", "EXPIRED"] as const) {
      expect(revealedSeed({ ...row, status })).toBeNull();
      expect(coreView({ ...row, status }).seed).toBeNull();
    }
  });

  it("révélée une fois jouée, avec l'issue", () => {
    const view = coreView(done);
    expect(view).toMatchObject({ seed: SEED, result: "URA", winnerId: "b", resolvedAt: "2026-12-05T13:00:00.000Z" });
    expect(JSON.stringify(coreView(row))).not.toContain(SEED);
  });
});

describe("point de vue", () => {
  it("face de chaque joueur", () => {
    expect(sideOf(done, "a")).toBe("OMOTE");
    expect(sideOf(done, "b")).toBe("URA");
    expect(sideOf(done, "c")).toBeNull();
  });

  it("issue pour les deux joueurs, rien pour un spectateur ou une table ouverte", () => {
    expect(outcomeFor(done, "b")).toBe("won");
    expect(outcomeFor(done, "a")).toBe("lost");
    expect(outcomeFor(done, "c")).toBeNull();
    expect(outcomeFor(row, "a")).toBeNull();
  });
});

describe("statistiques", () => {
  it("compte victoires, défaites, faces et série en cours (de la plus récente à la plus ancienne)", () => {
    const won = { ...done, winnerId: "a", result: "OMOTE" as const };
    const lost = done;
    const rows = [won, won, lost, won, row];
    expect(flipStats(rows, "a")).toEqual({ played: 4, won: 3, lost: 1, omote: 3, ura: 1, streak: 2 });
    expect(flipStats([lost, lost, won], "a").streak).toBe(-2);
    expect(flipStats([], "a")).toEqual({ played: 0, won: 0, lost: 0, omote: 0, ura: 0, streak: 0 });
  });
});
