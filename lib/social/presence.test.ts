import { describe, expect, it } from "vitest";
import { isOnline, offlineFor, presenceOf, shouldTouch, type PresenceRow } from "./presence";

const now = new Date("2026-10-30T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const row = (patch: Partial<PresenceRow> = {}): PresenceRow => ({ lastSeenAt: ago(60), appearOffline: false, role: "USER", isGuest: false, ...patch });

describe("isOnline", () => {
  it("en ligne s'il a été vu depuis moins du délai", () => {
    expect(isOnline(row(), now, 300)).toBe(true);
    expect(isOnline(row({ lastSeenAt: ago(299) }), now, 300)).toBe(true);
    expect(isOnline(row({ lastSeenAt: ago(300) }), now, 300)).toBe(false);
    expect(isOnline(row({ lastSeenAt: null }), now, 300)).toBe(false);
  });

  it("jamais pour un invité", () => {
    expect(isOnline(row({ isGuest: true }), now, 300)).toBe(false);
  });

  it("l'équipe peut se mettre hors ligne, pas un joueur", () => {
    expect(isOnline(row({ role: "ADMIN", appearOffline: true }), now, 300)).toBe(false);
    expect(isOnline(row({ role: "DEV", appearOffline: true }), now, 300)).toBe(false);
    // Ancien membre de l'équipe redevenu joueur : le choix resté en base ne compte plus
    expect(isOnline(row({ role: "USER", appearOffline: true }), now, 300)).toBe(true);
  });
});

describe("presenceOf", () => {
  it("donne la dernière activité quand le joueur n'est plus là", () => {
    expect(presenceOf(row(), now, 300)).toEqual({ online: true });
    expect(presenceOf(row({ lastSeenAt: ago(3_600) }), now, 300)).toEqual({ online: false, lastSeenAt: ago(3_600) });
    expect(presenceOf(row({ lastSeenAt: null }), now, 300)).toEqual({ online: false, lastSeenAt: null });
  });
});

describe("offlineFor", () => {
  it("choisit minutes, heures puis jours", () => {
    expect(offlineFor(ago(10), now)).toEqual({ unit: "minutes", count: 1 });
    expect(offlineFor(ago(5 * 60), now)).toEqual({ unit: "minutes", count: 5 });
    expect(offlineFor(ago(59 * 60 + 59), now)).toEqual({ unit: "minutes", count: 59 });
    expect(offlineFor(ago(60 * 60), now)).toEqual({ unit: "hours", count: 1 });
    expect(offlineFor(ago(23 * 3_600 + 3_599), now)).toEqual({ unit: "hours", count: 23 });
    expect(offlineFor(ago(24 * 3_600), now)).toEqual({ unit: "days", count: 1 });
    expect(offlineFor(ago(9 * 86_400 + 100), now)).toEqual({ unit: "days", count: 9 });
  });

  it("une horloge en avance ne donne jamais moins d'une minute", () => {
    expect(offlineFor(new Date(now.getTime() + 5_000), now)).toEqual({ unit: "minutes", count: 1 });
  });
});

describe("shouldTouch", () => {
  it("écrit au plus une fois par demi-battement", () => {
    expect(shouldTouch(null, now, 120)).toBe(true);
    expect(shouldTouch(ago(30), now, 120)).toBe(false);
    expect(shouldTouch(ago(61), now, 120)).toBe(true);
  });
});
