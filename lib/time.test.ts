import { describe, expect, it } from "vitest";
import { countdownParts } from "./time";
import { isActive, NAV_ITEMS } from "./nav";

describe("countdownParts", () => {
  it("minutes et secondes, arrondies à la seconde supérieure", () => {
    expect(countdownParts(8 * 60_000 + 14_200)).toEqual({ unit: "minSec", minutes: 8, seconds: 15 });
  });

  it("secondes seules sous une minute, jamais négatif", () => {
    expect(countdownParts(59_000)).toEqual({ unit: "sec", seconds: 59 });
    expect(countdownParts(-5)).toEqual({ unit: "sec", seconds: 0 });
  });

  it("heures et minutes au-delà d'une heure", () => {
    expect(countdownParts(2 * 3_600_000 + 5 * 60_000)).toEqual({ unit: "hourMin", hours: 2, minutes: 5 });
  });

  it("jours et heures au-delà de 24 h, seulement sur demande", () => {
    const ms = 2 * 86_400_000 + 4 * 3_600_000 + 30 * 60_000;
    expect(countdownParts(ms, { days: true })).toEqual({ unit: "dayHour", days: 2, hours: 4 });
    expect(countdownParts(ms)).toEqual({ unit: "hourMin", hours: 52, minutes: 30 });
    expect(countdownParts(23 * 3_600_000, { days: true })).toEqual({ unit: "hourMin", hours: 23, minutes: 0 });
  });
});

describe("isActive", () => {
  const boosters = NAV_ITEMS.find((i) => i.key === "boosters")!;

  it("la page et ses sous-pages activent l'entrée", () => {
    expect(isActive(boosters, "/")).toBe(true);
    expect(isActive(boosters, "/ouvrir/standard")).toBe(true);
  });

  it("un simple préfixe commun ne l'active pas", () => {
    expect(isActive(boosters, "/boostersx")).toBe(false);
    expect(isActive(boosters, "/wiki")).toBe(false);
  });
});
