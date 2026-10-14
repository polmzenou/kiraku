import { describe, expect, it } from "vitest";
import { isoWeekKey, localMidnight, periodWindow } from "./period";

const PARIS = "Europe/Paris";

describe("périodes du jeu", () => {
  it("un jour va de minuit à minuit, heure de Paris", () => {
    const w = periodWindow("DAILY", new Date("2026-10-14T21:30:00Z"), PARIS); // 23 h 30 à Paris
    expect(w.key).toBe("2026-10-14");
    expect(w.start.toISOString()).toBe("2026-10-13T22:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-14T22:00:00.000Z");
  });

  it("passé minuit à Paris, c'est déjà le jour suivant même si UTC est encore la veille", () => {
    const w = periodWindow("DAILY", new Date("2026-10-14T22:30:00Z"), PARIS);
    expect(w.key).toBe("2026-10-15");
  });

  it("le jour du passage à l'heure d'hiver dure 25 h", () => {
    const w = periodWindow("DAILY", new Date("2026-10-25T12:00:00Z"), PARIS);
    expect(w.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("le jour du passage à l'heure d'été dure 23 h", () => {
    const w = periodWindow("DAILY", new Date("2026-03-29T12:00:00Z"), PARIS);
    expect(w.end.getTime() - w.start.getTime()).toBe(23 * 3_600_000);
  });

  it("une semaine va du lundi minuit au lundi suivant", () => {
    const w = periodWindow("WEEKLY", new Date("2026-10-14T10:00:00Z"), PARIS); // mercredi
    expect(w.key).toBe("2026-W42");
    expect(w.start.toISOString()).toBe("2026-10-11T22:00:00.000Z"); // lundi 12 à minuit, Paris
    expect(w.end.toISOString()).toBe("2026-10-18T22:00:00.000Z");
  });

  it("le dimanche appartient encore à la semaine commencée le lundi", () => {
    expect(periodWindow("WEEKLY", new Date("2026-10-18T20:00:00Z"), PARIS).key).toBe("2026-W42");
    expect(periodWindow("WEEKLY", new Date("2026-10-18T22:30:00Z"), PARIS).key).toBe("2026-W43");
  });

  it("numérote les semaines ISO autour du nouvel an", () => {
    expect(isoWeekKey({ year: 2026, month: 12, day: 31 })).toBe("2026-W53");
    expect(isoWeekKey({ year: 2027, month: 1, day: 3 })).toBe("2026-W53");
    expect(isoWeekKey({ year: 2027, month: 1, day: 4 })).toBe("2027-W01");
    expect(isoWeekKey({ year: 2024, month: 12, day: 30 })).toBe("2025-W01");
  });

  it("minuit local dans un autre fuseau", () => {
    expect(localMidnight({ year: 2026, month: 7, day: 1 }, "Asia/Tokyo").toISOString()).toBe("2026-06-30T15:00:00.000Z");
    expect(localMidnight({ year: 2026, month: 1, day: 15 }, "UTC").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});
