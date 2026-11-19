import { describe, expect, it } from "vitest";
import { wrappedPhase, yearWindow } from "./period";
import { hasYear, pickFavorite, winRate, zeniTotals } from "./summary";

describe("période du Wrapped", () => {
  it("raconte l'année civile du fuseau du jeu", () => {
    const { start, end } = yearWindow(2026, "Europe/Paris");
    expect(start.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    // 31 décembre 23 h 30 à Paris : encore dans 2026 ; 1er janvier 0 h 30 : déjà 2027
    const inYear = (iso: string) => { const t = Date.parse(iso); return t >= start.getTime() && t < end.getTime(); };
    expect(inYear("2026-12-31T22:30:00Z")).toBe(true);
    expect(inYear("2026-12-31T23:30:00Z")).toBe(false);
    expect(inYear("2025-12-31T23:30:00Z")).toBe(true);
  });

  it("n'ouvre que pendant la fenêtre, et jamais coupé", () => {
    const w = { enabled: true, opensAt: "2026-11-30T23:00:00.000Z", closesAt: "2027-01-31T23:00:00.000Z" };
    expect(wrappedPhase(w, new Date("2026-11-17T12:00:00Z"))).toBe("before");
    expect(wrappedPhase(w, new Date("2026-11-30T23:00:00Z"))).toBe("open");
    expect(wrappedPhase(w, new Date("2027-01-31T23:00:00Z"))).toBe("closed");
    expect(wrappedPhase({ ...w, enabled: false }, new Date("2026-12-10T12:00:00Z"))).toBe("off");
  });
});

describe("Zeni de l'année", () => {
  it("additionne gains et dépenses, sans compter les séquestres rendus", () => {
    const totals = zeniTotals([
      { reason: "DAILY", gained: 3000, spent: 0 },
      { reason: "SALE", gained: 5000, spent: 0 },
      { reason: "BOOSTER", gained: 0, spent: 1200 },
      { reason: "FEE", gained: 0, spent: 250 },
      // 3 mises de 100 bloquées, 2 rendues : une enchère gagnée à 100
      { reason: "BID_HOLD", gained: 0, spent: 300 },
      { reason: "BID_REFUND", gained: 200, spent: 0 },
      // Avis bloqué puis rendu : rien
      { reason: "ORDER_HOLD", gained: 0, spent: 500 },
      { reason: "ORDER_REFUND", gained: 500, spent: 0 },
    ]);
    expect(totals).toEqual({ earned: 8000, spent: 1200 + 250 + 100, topSource: "SALE" });
  });

  it("n'a pas de source sans aucun gain", () => {
    expect(zeniTotals([{ reason: "BOOSTER", gained: 0, spent: 200 }])).toEqual({ earned: 0, spent: 200, topSource: null });
    expect(zeniTotals([])).toEqual({ earned: 0, spent: 0, topSource: null });
  });
});

describe("carte préférée", () => {
  it("prend la plus jouée en combat, puis la vitrine, puis le plus gros tirage", () => {
    expect(pickFavorite([{ cardId: "b", battles: 4 }, { cardId: "a", battles: 9 }], "s", "p")).toEqual({ cardId: "a", source: "battle", battles: 9 });
    expect(pickFavorite([{ cardId: "b", battles: 4 }, { cardId: "a", battles: 4 }], null, null)?.cardId).toBe("a");
    expect(pickFavorite([], "s", "p")).toEqual({ cardId: "s", source: "showcase", battles: 0 });
    expect(pickFavorite([{ cardId: "x", battles: 0 }], null, "p")).toEqual({ cardId: "p", source: "pull", battles: 0 });
    expect(pickFavorite([], null, null)).toBeNull();
  });
});

describe("résumé", () => {
  it("n'a d'année à raconter qu'avec au moins un booster ouvert", () => {
    expect(hasYear({ boosters: { opened: 0, golden: 0, divine: 0, zeniSpent: 0 } })).toBe(false);
    expect(hasYear({ boosters: { opened: 1, golden: 0, divine: 0, zeniSpent: 0 } })).toBe(true);
  });

  it("arrondit la part de victoires", () => {
    expect(winRate({ played: 0, won: 0 })).toBeNull();
    expect(winRate({ played: 3, won: 2 })).toBe(67);
  });
});
