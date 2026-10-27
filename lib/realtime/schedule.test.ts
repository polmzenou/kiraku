import { describe, expect, it } from "vitest";
import { isIdle, nextPollDelay, pollOnResume, type PollContext } from "./schedule";

const base: PollContext = { baseSeconds: 60, realtimeConnected: false, hidden: false, idle: false, unchanged: 0, backoffMax: 4 };

describe("cadence des sondages", () => {
  it("sonde au délai de base quand le joueur est là", () => {
    expect(nextPollDelay(base)).toBe(60_000);
  });

  it("ne sonde pas onglet caché ni joueur inactif", () => {
    expect(nextPollDelay({ ...base, hidden: true })).toBeNull();
    expect(nextPollDelay({ ...base, idle: true })).toBeNull();
  });

  it("double le délai sans nouveauté, jusqu'au plafond", () => {
    expect(nextPollDelay({ ...base, unchanged: 1 })).toBe(120_000);
    expect(nextPollDelay({ ...base, unchanged: 2 })).toBe(240_000);
    expect(nextPollDelay({ ...base, unchanged: 10 })).toBe(240_000);
    expect(nextPollDelay({ ...base, unchanged: 10, backoffMax: 1 })).toBe(60_000);
  });

  it("prend le délai de secours quand le temps réel est connecté", () => {
    expect(nextPollDelay({ ...base, realtimeSeconds: 180, realtimeConnected: true })).toBe(180_000);
    expect(nextPollDelay({ ...base, realtimeSeconds: 180, realtimeConnected: false })).toBe(60_000);
    expect(nextPollDelay({ ...base, realtimeConnected: true })).toBe(60_000);
  });

  it("ne descend jamais sous une seconde", () => {
    expect(nextPollDelay({ ...base, baseSeconds: 0 })).toBe(1000);
  });
});

describe("inactivité et reprise", () => {
  it("devient inactif passé le délai sans geste", () => {
    expect(isIdle(0, 299_999, 300)).toBe(false);
    expect(isIdle(0, 300_000, 300)).toBe(true);
  });

  it("ne resonde au retour que si le dernier sondage est assez ancien", () => {
    expect(pollOnResume(0, 10_000, 60)).toBe(false);
    expect(pollOnResume(0, 60_000, 60)).toBe(true);
  });
});
