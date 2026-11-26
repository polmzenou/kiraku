import { describe, expect, it } from "vitest";
import { COUNTDOWN_MAX_REFRESHES, COUNTDOWN_RETRY_MS, countdownRefreshDue } from "./countdown-refresh";

// Compte à rebours arrivé à zéro : un seul rendu serveur par échéance, puis des essais espacés, trois au plus.

const now = 1_000_000;

describe("rafraîchissement d'un compte à rebours à zéro", () => {
  it("rafraîchit tout de suite la première fois, onglet visible", () => {
    expect(countdownRefreshDue(undefined, now, true)).toBe(true);
  });

  it("attend le retour d'un onglet caché", () => {
    expect(countdownRefreshDue(undefined, now, false)).toBe(false);
    expect(countdownRefreshDue({ at: now - COUNTDOWN_RETRY_MS, count: 1 }, now, false)).toBe(false);
  });

  it("ne redemande pas la même échéance avant 15 s (plusieurs comptes à rebours sur la page)", () => {
    expect(countdownRefreshDue({ at: now - 1000, count: 1 }, now, true)).toBe(false);
    expect(countdownRefreshDue({ at: now - COUNTDOWN_RETRY_MS + 1, count: 1 }, now, true)).toBe(false);
    expect(countdownRefreshDue({ at: now - COUNTDOWN_RETRY_MS, count: 1 }, now, true)).toBe(true);
  });

  it("abandonne après trois essais (le serveur renvoie toujours la même échéance)", () => {
    expect(countdownRefreshDue({ at: now - 60_000, count: COUNTDOWN_MAX_REFRESHES - 1 }, now, true)).toBe(true);
    expect(countdownRefreshDue({ at: now - 60_000, count: COUNTDOWN_MAX_REFRESHES }, now, true)).toBe(false);
  });
});
