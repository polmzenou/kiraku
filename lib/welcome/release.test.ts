import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_KEYS, pendingAnnouncement, type Announcement } from "./release";

const list: Announcement[] = [
  { key: "apology", at: new Date("2026-10-20T18:45:00Z") },
  { key: "v2", at: new Date("2026-10-27T18:00:00Z") },
];
const NOW = new Date("2026-11-17T12:00:00Z");

describe("annonces de l'équipe", () => {
  it("un compte qui n'a jamais rien vu ne reçoit que la dernière annonce", () => {
    expect(pendingAnnouncement(null, NOW, list)?.key).toBe("v2");
  });

  it("les annonces manquées passent une par une, la plus ancienne d'abord", () => {
    expect(pendingAnnouncement(new Date("2026-09-01T10:00:00Z"), NOW, list)?.key).toBe("apology");
    expect(pendingAnnouncement(list[0].at, NOW, list)?.key).toBe("v2");
    expect(pendingAnnouncement(new Date("2026-10-21T08:00:00Z"), NOW, list)?.key).toBe("v2");
  });

  it("plus rien une fois la dernière annonce vue", () => {
    expect(pendingAnnouncement(list[1].at, NOW, list)).toBeNull();
    expect(pendingAnnouncement(new Date("2026-11-01T08:00:00Z"), NOW, list)).toBeNull();
  });

  it("une annonce datée dans le futur attend son heure sans faire sauter les précédentes", () => {
    const withCasino: Announcement[] = [...list, { key: "casino", at: new Date("2026-12-01T19:00:00Z") }];
    expect(pendingAnnouncement(null, NOW, withCasino)?.key).toBe("v2");
    expect(pendingAnnouncement(list[0].at, NOW, withCasino)?.key).toBe("v2");
    expect(pendingAnnouncement(list[1].at, NOW, withCasino)).toBeNull();
    // À l'heure dite, elle passe
    const later = new Date("2026-12-01T19:00:00Z");
    expect(pendingAnnouncement(list[1].at, later, withCasino)?.key).toBe("casino");
    expect(pendingAnnouncement(null, later, withCasino)?.key).toBe("casino");
  });

  it("l'ordre de la liste n'importe pas : la plus ancienne non vue d'abord", () => {
    const shuffled: Announcement[] = [{ key: "casino", at: new Date("2026-11-10T19:00:00Z") }, ...list];
    expect(pendingAnnouncement(list[0].at, NOW, shuffled)?.key).toBe("v2");
    expect(pendingAnnouncement(list[1].at, NOW, shuffled)?.key).toBe("casino");
  });

  it("toutes les clés sont connues pour la réservation", () => {
    expect(ANNOUNCEMENT_KEYS).toEqual(expect.arrayContaining(["apology", "v2", "v25", "casino", "referral"]));
  });
});
