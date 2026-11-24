import { describe, expect, it } from "vitest";
import { DEFAULT_REFERRAL_V2_RULES as RULES } from "./rules";
import {
  evaluateSteps,
  INSTALL_OPENING_SOURCES,
  installCountFrom,
  stepProgress,
  stepWindow,
  type ActiveDay,
  type RefereeFacts,
  type StepTimes,
} from "./steps";

const TZ = "Europe/Paris";
const HOUR = 3_600_000;
const at = (iso: string) => new Date(iso);
// Un jour actif par clé, première ouverture à 18 h, heure de Paris en hiver
const days = (...keys: string[]): ActiveDay[] => keys.map((day) => ({ day, firstAt: at(`${day}T17:00:00Z`) }));

const REFERRED = at("2026-11-24T10:00:00Z");
const facts = (over: Partial<RefereeFacts> = {}): RefereeFacts => ({
  referredAt: REFERRED,
  registeredAt: at("2026-11-24T09:55:00Z"),
  verifiedAt: at("2026-11-24T10:01:00Z"),
  installOpenings: 20,
  installOpeningAt: at("2026-11-24T20:00:00Z"),
  activeDays: [],
  ...over,
});

describe("étapes 1 et 2", () => {
  it("l'étape 1 tombe à l'inscription vérifiée, pas avant le rattachement", () => {
    const [s1] = evaluateSteps(facts(), RULES, TZ, at("2026-11-24T12:00:00Z"));
    expect(s1).toEqual(at("2026-11-24T10:01:00Z"));
    expect(evaluateSteps(facts({ verifiedAt: null }), RULES, TZ, at("2026-11-30T00:00:00Z"))[0]).toBeNull();
    expect(evaluateSteps(facts({ registeredAt: null }), RULES, TZ, at("2026-11-30T00:00:00Z"))[0]).toBeNull();
  });

  it("l'étape 2 attend 48 h après le rattachement et la 20e ouverture hors cadeau", () => {
    expect(evaluateSteps(facts(), RULES, TZ, at("2026-11-26T09:59:00Z"))[1]).toBeNull();
    expect(evaluateSteps(facts(), RULES, TZ, at("2026-11-26T10:00:00Z"))[1]).toEqual(at("2026-11-26T10:00:00Z"));
    const late = facts({ installOpeningAt: at("2026-11-27T09:00:00Z") });
    expect(evaluateSteps(late, RULES, TZ, at("2026-12-01T00:00:00Z"))[1]).toEqual(at("2026-11-27T09:00:00Z"));
    expect(evaluateSteps(facts({ installOpenings: 19, installOpeningAt: null }), RULES, TZ, at("2026-12-01T00:00:00Z"))[1]).toBeNull();
  });

  it("l'étape 2 exige l'étape 1", () => {
    expect(evaluateSteps(facts({ verifiedAt: null }), RULES, TZ, at("2026-12-01T00:00:00Z"))[1]).toBeNull();
  });

  it("seules la réserve gratuite et les boosters achetés comptent, jamais un cadeau", () => {
    expect([...INSTALL_OPENING_SOURCES].sort()).toEqual(["FREE", "PAID"]);
    expect(INSTALL_OPENING_SOURCES).not.toContain("CREDIT");
    expect(INSTALL_OPENING_SOURCES).not.toContain("SEALED");
  });

  it("le premier booster ouvert en invité, juste avant l'inscription, compte", () => {
    expect(installCountFrom(REFERRED, RULES)).toEqual(new Date(REFERRED.getTime() - 2 * HOUR));
  });
});

describe("étapes 3 et 4", () => {
  const NOW = at("2027-01-15T00:00:00Z");

  it("5 jours actifs dans les 14 premiers, jour du rattachement compris : l'étape 3 tombe au 5e", () => {
    const f = facts({ activeDays: days("2026-11-24", "2026-11-25", "2026-11-27", "2026-11-29", "2026-12-07") });
    expect(evaluateSteps(f, RULES, TZ, NOW)[2]).toEqual(at("2026-12-07T17:00:00Z"));
  });

  it("un jour après la fenêtre ne compte pas", () => {
    const f = facts({ activeDays: days("2026-11-24", "2026-11-25", "2026-11-27", "2026-11-29", "2026-12-08") });
    expect(evaluateSteps(f, RULES, TZ, NOW)[2]).toBeNull();
  });

  it("l'étape 4 peut tomber après une étape 3 manquée", () => {
    const first14 = ["2026-11-24", "2026-11-26", "2026-11-28", "2026-11-30"];
    const after = ["2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];
    const f = facts({ activeDays: days(...first14, ...after) });
    const times = evaluateSteps(f, RULES, TZ, NOW);
    expect(times[2]).toBeNull();
    expect(times[3]).toEqual(at("2026-12-18T17:00:00Z"));
    const states = stepProgress(f, times, RULES, TZ, NOW, { held: false, paid: [true, true, false, true] }).map((s) => s.state);
    expect(states).toEqual(["DONE", "DONE", "MISSED", "DONE"]);
  });

  it("les jours actifs comptent avant l'étape 2, qui reste exigée : l'étape 3 tombe avec elle", () => {
    const f = facts({ installOpenings: 12, installOpeningAt: null, activeDays: days("2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28") });
    expect(evaluateSteps(f, RULES, TZ, NOW)[2]).toBeNull();
    const installed = { ...f, installOpenings: 20, installOpeningAt: at("2026-12-20T12:00:00Z") };
    expect(evaluateSteps(installed, RULES, TZ, NOW)[2]).toEqual(at("2026-12-20T12:00:00Z"));
  });
});

describe("fenêtres dans le fuseau du jeu", () => {
  it("passage à l'heure d'hiver : la fenêtre finit à minuit, heure de Paris", () => {
    const w = stepWindow(at("2026-10-20T08:00:00Z"), 14, TZ);
    expect(w).toEqual({ firstDay: "2026-10-20", lastDay: "2026-11-02", end: at("2026-11-02T23:00:00Z") });
  });

  it("passage à l'heure d'été : la fenêtre finit à minuit, heure de Paris", () => {
    const w = stepWindow(at("2026-03-20T12:00:00Z"), 14, TZ);
    expect(w).toEqual({ firstDay: "2026-03-20", lastDay: "2026-04-02", end: at("2026-04-02T22:00:00Z") });
  });

  it("le jour du rattachement est celui du fuseau du jeu, pas celui d'UTC", () => {
    expect(stepWindow(at("2026-03-28T23:30:00Z"), 1, TZ).firstDay).toBe("2026-03-29");
  });
});

describe("ce que voit le joueur", () => {
  const NOW = at("2026-11-27T12:00:00Z");
  const f = facts({ installOpenings: 7, installOpeningAt: null, activeDays: days("2026-11-24", "2026-11-25") });
  const times: StepTimes = evaluateSteps(f, RULES, TZ, NOW);

  it("étape atteinte, prochaine, verrouillées, avec l'avancement et les échéances", () => {
    const rows = stepProgress(f, times, RULES, TZ, NOW, { held: false, paid: [true, false, false, false] });
    expect(rows.map((r) => r.state)).toEqual(["DONE", "NEXT", "LOCKED", "LOCKED"]);
    expect(rows[1]).toMatchObject({ have: 7, need: 20, readyAt: at("2026-11-26T10:00:00Z") });
    expect(rows[2]).toMatchObject({ have: 2, need: 5, deadline: at("2026-12-07T23:00:00Z") });
    expect(rows[3]).toMatchObject({ have: 2, need: 15, deadline: at("2026-12-23T23:00:00Z") });
  });

  it("un parrainage « À vérifier » met en attente l'étape en cours et ce qui n'est pas versé", () => {
    const rows = stepProgress(f, times, RULES, TZ, NOW, { held: true, paid: [false, false, false, false] });
    expect(rows.map((r) => r.state)).toEqual(["HELD", "HELD", "LOCKED", "LOCKED"]);
    const paid = stepProgress(f, times, RULES, TZ, NOW, { held: true, paid: [true, false, false, false] });
    expect(paid[0].state).toBe("DONE");
  });
});
