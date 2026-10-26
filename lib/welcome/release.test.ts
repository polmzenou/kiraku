import { describe, expect, it } from "vitest";
import { pendingAnnouncement, type Announcement } from "./release";

const list: Announcement[] = [
  { key: "apology", at: new Date("2026-10-20T18:45:00Z") },
  { key: "v2", at: new Date("2026-10-27T18:00:00Z") },
];

describe("annonces de l'équipe", () => {
  it("un compte qui n'a jamais rien vu ne reçoit que la dernière annonce", () => {
    expect(pendingAnnouncement(null, list)?.key).toBe("v2");
  });

  it("les annonces manquées passent une par une, la plus ancienne d'abord", () => {
    expect(pendingAnnouncement(new Date("2026-09-01T10:00:00Z"), list)?.key).toBe("apology");
    expect(pendingAnnouncement(list[0].at, list)?.key).toBe("v2");
    expect(pendingAnnouncement(new Date("2026-10-21T08:00:00Z"), list)?.key).toBe("v2");
  });

  it("plus rien une fois la dernière annonce vue", () => {
    expect(pendingAnnouncement(list[1].at, list)).toBeNull();
    expect(pendingAnnouncement(new Date("2026-11-01T08:00:00Z"), list)).toBeNull();
  });
});
