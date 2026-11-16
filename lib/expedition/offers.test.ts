import { describe, expect, it } from "vitest";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { DEFAULT_EXPEDITIONS } from "./catalog";
import { boardSeed, generateBoard, riskPlan, type BoardCandidate } from "./offers";
import { tierOf } from "./tiers";

const catalog: BoardCandidate[] = DEFAULT_EXPEDITIONS.map((d) => ({
  id: d.slug,
  risk: d.risk,
  tier: tierOf(d.minRarity, BASE_DEFINITIONS)!,
  durationMinutes: d.durationMinutes,
  weight: d.weight,
}));
const byId = new Map(catalog.map((c) => [c.id, c]));
const EPIC = tierOf("EPIC", BASE_DEFINITIONS)!;
const MYTHIC = tierOf("MYTHIC", BASE_DEFINITIONS)!;

describe("offres du jour", () => {
  it("prévoit une offre sûre, des équilibrées et une périlleuse", () => {
    expect(riskPlan(0)).toEqual([]);
    expect(riskPlan(1)).toEqual(["BALANCED"]);
    expect(riskPlan(2)).toEqual(["SAFE", "RISKY"]);
    expect(riskPlan(3)).toEqual(["SAFE", "BALANCED", "RISKY"]);
    expect(riskPlan(5)).toEqual(["SAFE", "BALANCED", "BALANCED", "BALANCED", "RISKY"]);
  });

  it("est stable pour un même joueur et un même jour, et varie d'un jour à l'autre", () => {
    const seed = boardSeed("user-1", "2026-11-16");
    const a = generateBoard(catalog, seed, { offersPerDay: 3, staffableTier: MYTHIC });
    expect(generateBoard([...catalog].reverse(), seed, { offersPerDay: 3, staffableTier: MYTHIC })).toEqual(a);
    const days = new Set(
      Array.from({ length: 14 }, (_, d) => generateBoard(catalog, boardSeed("user-1", `2026-11-${10 + d}`), { offersPerDay: 3, staffableTier: MYTHIC }).join()),
    );
    expect(days.size).toBeGreaterThan(5);
  });

  it("donne des paliers et des durées tous différents, triés par durée, avec une offre jouable", () => {
    for (let i = 0; i < 300; i++) {
      const staffable = i % 2 ? MYTHIC : EPIC;
      const board = generateBoard(catalog, boardSeed(`user-${i}`, "2026-11-16"), { offersPerDay: 3, staffableTier: staffable }).map((id) => byId.get(id)!);
      expect(board).toHaveLength(3);
      expect(new Set(board.map((c) => c.tier)).size).toBe(3);
      expect(new Set(board.map((c) => c.durationMinutes)).size).toBe(3);
      expect(board.map((c) => c.durationMinutes)).toEqual([...board.map((c) => c.durationMinutes)].sort((x, y) => x - y));
      expect(board.map((c) => c.risk).sort()).toEqual(["BALANCED", "RISKY", "SAFE"]);
      const safe = board.find((c) => c.risk === "SAFE")!;
      expect(safe.tier).toBeLessThanOrEqual(staffable);
    }
  });

  it("sans carte assez rare, propose l'offre sûre la plus accessible", () => {
    for (let i = 0; i < 50; i++) {
      const board = generateBoard(catalog, boardSeed(`new-${i}`, "2026-11-16"), { offersPerDay: 3, staffableTier: null }).map((id) => byId.get(id)!);
      expect(board.find((c) => c.risk === "SAFE")!.tier).toBe(EPIC);
    }
  });

  it("se replie quand le catalogue est trop petit", () => {
    const tiny: BoardCandidate[] = [
      { id: "a", risk: "BALANCED", tier: 3, durationMinutes: 60, weight: 1 },
      { id: "b", risk: "BALANCED", tier: 3, durationMinutes: 60, weight: 1 },
    ];
    expect(generateBoard(tiny, 1, { offersPerDay: 3, staffableTier: null }).sort()).toEqual(["a", "b"]);
    expect(generateBoard([], 1, { offersPerDay: 3, staffableTier: null })).toEqual([]);
    // Poids nul : jamais tiré
    expect(generateBoard([{ ...tiny[0], weight: 0 }], 1, { offersPerDay: 3, staffableTier: null })).toEqual([]);
  });
});
