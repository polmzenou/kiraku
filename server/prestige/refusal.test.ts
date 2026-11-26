import { describe, expect, it } from "vitest";
import { accountRefusal, playerRefusal } from "./prestige-core";

// Refus de la renaissance qui ne dépendent que du compte et du délai (le reste se lit sous verrou, prestige.db.test.ts).

const NOW = new Date("2026-11-26T12:00:00.000Z");
const DAY = 24 * 3_600_000;
const ok = { isGuest: false, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null, prestigedAt: null };

describe("refus de la renaissance", () => {
  it("un compte en règle, jamais rené, peut renaître", () => {
    expect(playerRefusal(ok, { minDaysBetween: 30 }, NOW)).toBeNull();
  });

  it("invité, banni, suppression demandée ou compte anonymisé : refusé, dans cet ordre", () => {
    expect(accountRefusal({ ...ok, isGuest: true, bannedAt: NOW })).toBe("GUEST");
    expect(accountRefusal({ ...ok, bannedAt: NOW, deletionRequestedAt: NOW })).toBe("BANNED");
    expect(accountRefusal({ ...ok, deletionRequestedAt: NOW })).toBe("FROZEN");
    expect(accountRefusal({ ...ok, anonymizedAt: NOW })).toBe("FROZEN");
    expect(playerRefusal({ ...ok, isGuest: true }, { minDaysBetween: 0 }, NOW)).toBe("GUEST");
  });

  it("délai entre deux renaissances : refusé avant son terme, permis à son terme ou sans délai", () => {
    const yesterday = new Date(NOW.getTime() - DAY);
    expect(playerRefusal({ ...ok, prestigedAt: yesterday }, { minDaysBetween: 2 }, NOW)).toBe("TOO_SOON");
    expect(playerRefusal({ ...ok, prestigedAt: yesterday }, { minDaysBetween: 1 }, NOW)).toBeNull();
    expect(playerRefusal({ ...ok, prestigedAt: NOW }, { minDaysBetween: 0 }, NOW)).toBeNull();
  });

  it("le compte passe avant le délai : un banni pendant son délai est refusé comme banni", () => {
    expect(playerRefusal({ ...ok, bannedAt: NOW, prestigedAt: NOW }, { minDaysBetween: 7 }, NOW)).toBe("BANNED");
  });
});
