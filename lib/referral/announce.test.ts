import { describe, expect, it } from "vitest";
import { referralAnnouncementAt } from "./announce";

const AT = "2026-12-01T18:00:00.000Z";
const at = new Date(AT).getTime();
const DAY = 86_400_000;
const rules = { enabled: true, announceAt: AT, announceDays: 14 };
const old = { isGuest: false, createdAt: new Date("2026-10-01T10:00:00Z") };

describe("annonce du parrainage v2", () => {
  it("une fois la date passée, pendant la fenêtre, aux comptes inscrits avant", () => {
    expect(referralAnnouncementAt(rules, at + DAY, old)?.toISOString()).toBe(AT);
    expect(referralAnnouncementAt(rules, at, old)?.toISOString()).toBe(AT);
    expect(referralAnnouncementAt(rules, at + 14 * DAY - 1, old)?.toISOString()).toBe(AT);
  });

  it("rien avant la date, après la fenêtre, sans date ou parrainage v2 coupé", () => {
    expect(referralAnnouncementAt(rules, at - 1, old)).toBeNull();
    expect(referralAnnouncementAt(rules, at + 14 * DAY, old)).toBeNull();
    expect(referralAnnouncementAt({ ...rules, announceAt: null }, at + DAY, old)).toBeNull();
    expect(referralAnnouncementAt({ ...rules, enabled: false }, at + DAY, old)).toBeNull();
    expect(referralAnnouncementAt({ ...rules, announceDays: 0 }, at, old)).toBeNull();
    expect(referralAnnouncementAt({ ...rules, announceAt: "pas une date" }, at + DAY, old)).toBeNull();
  });

  it("ni aux invités, ni aux comptes créés après l'annonce", () => {
    expect(referralAnnouncementAt(rules, at + DAY, { ...old, isGuest: true })).toBeNull();
    expect(referralAnnouncementAt(rules, at + 2 * DAY, { isGuest: false, createdAt: new Date(at + DAY) })).toBeNull();
  });
});
