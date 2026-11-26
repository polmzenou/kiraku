import { describe, expect, it } from "vitest";
import { countdownParts, countdownStep } from "./time";
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

describe("countdownStep", () => {
  // Le texte change quand countdownParts change : on le vérifie seconde par seconde autour de chaque réveil
  const parts = (s: number, days: boolean) => JSON.stringify(countdownParts(s * 1000, { days }));
  const check = (s: number, days: boolean) => {
    const step = countdownStep(s * 1000, { days });
    for (let k = 1; k < step; k++) expect(parts(s - k, days)).toBe(parts(s, days));
    expect(parts(s - step, days)).not.toBe(parts(s, days));
  };

  it("chaque seconde sous une heure", () => {
    expect(countdownStep(59 * 60_000 + 30_000)).toBe(1);
    expect(countdownStep(500)).toBe(1);
    check(3599, false);
    check(61, false);
  });

  it("à la minute au-delà d'une heure, jusqu'au passage sous l'heure", () => {
    expect(countdownStep(3 * 3_600_000 + 5 * 60_000 + 42_000)).toBe(43);
    expect(countdownStep(3_600_000)).toBe(1);
    for (const s of [3600, 3601, 3659, 3660, 7322, 90_000]) check(s, false);
  });

  it("à l'heure au-delà d'un jour avec days, puis à la minute", () => {
    expect(countdownStep(2 * 86_400_000 + 4 * 3_600_000 + 30 * 60_000, { days: true })).toBe(30 * 60 + 1);
    for (const s of [86_400, 86_401, 90_000, 2 * 86_400 + 3599, 86_399]) check(s, true);
  });

  it("zéro une fois fini", () => {
    expect(countdownStep(0)).toBe(0);
    expect(countdownStep(-5000, { days: true })).toBe(0);
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
