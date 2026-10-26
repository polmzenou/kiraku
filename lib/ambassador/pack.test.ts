import { describe, expect, it } from "vitest";
import { periodWindow } from "@/lib/economy/period";
import { packStatus } from "./pack";

const TZ = "Europe/Paris";
const base = { ambassador: true, weeklyBoosters: 5, claimedKey: null };

describe("pack hebdomadaire des ambassadeurs", () => {
  it("est réservé aux ambassadeurs et coupé à 0 booster", () => {
    expect(packStatus({ ...base, ambassador: false }, "2026-W44")).toBe("none");
    expect(packStatus({ ...base, weeklyBoosters: 0 }, "2026-W44")).toBe("none");
  });

  it("se réclame une fois par semaine", () => {
    expect(packStatus(base, "2026-W44")).toBe("available");
    expect(packStatus({ ...base, claimedKey: "2026-W44" }, "2026-W44")).toBe("claimed");
    expect(packStatus({ ...base, claimedKey: "2026-W43" }, "2026-W44")).toBe("available");
  });

  it("change de semaine le lundi à minuit, heure de Paris", () => {
    // Dimanche 1er novembre 2026, 23:59 à Paris (UTC+1) puis lundi 00:00
    const sunday = periodWindow("WEEKLY", new Date("2026-11-01T22:59:00Z"), TZ);
    const monday = periodWindow("WEEKLY", new Date("2026-11-01T23:00:00Z"), TZ);
    expect(sunday.key).not.toBe(monday.key);
    expect(sunday.end).toEqual(monday.start);
    expect(packStatus({ ...base, claimedKey: sunday.key }, monday.key)).toBe("available");
  });
});
