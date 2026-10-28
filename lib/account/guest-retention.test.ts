import { describe, expect, it } from "vitest";
import { guestCutoff, sessionActiveSince } from "./guest-retention";

const NOW = new Date("2026-10-28T04:30:00Z");

describe("conservation des comptes invités", () => {
  it("date limite à N jours, purge désactivée à 0", () => {
    expect(guestCutoff(NOW, 7)?.toISOString()).toBe("2026-10-21T04:30:00.000Z");
    expect(guestCutoff(NOW, 0)).toBeNull();
    expect(guestCutoff(NOW, -3)).toBeNull();
  });

  it("une session prolongée après la date limite expire après limite + durée de session", () => {
    const cutoff = new Date("2026-10-21T00:00:00Z");
    expect(sessionActiveSince(cutoff, 90 * 86_400).toISOString()).toBe("2027-01-19T00:00:00.000Z");
  });
});
