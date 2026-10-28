import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { blendedPerHour, DEFAULT_VERCEL_BUDGET, invocationsPerHour, maxDailyPlayers, monthlyProjection, type PollSettings } from "./estimate";

const defaults = (ablyEnabled: boolean): PollSettings => ({
  ablyEnabled,
  notificationsPollSeconds: SETTING_DEFAULTS["notifications.pollSeconds"],
  realtimeSafetySeconds: SETTING_DEFAULTS["realtime.safetyPollSeconds"],
  chatPollSeconds: SETTING_DEFAULTS["chat.pollSeconds"],
  pullFeedRefreshSeconds: SETTING_DEFAULTS["home.pullFeed.refreshSeconds"],
  battlePollSeconds: SETTING_DEFAULTS["battle.pollSeconds"],
  battleSafetySeconds: SETTING_DEFAULTS["battle.safetyPollSeconds"],
  queuePollSeconds: SETTING_DEFAULTS["battle.queuePollSeconds"],
  lobbyPollSeconds: SETTING_DEFAULTS["battle.lobbyPollSeconds"],
  marketPollSeconds: SETTING_DEFAULTS["market.pollSeconds"],
});

// Réglages d'avant l'optimisation (octobre 2026), sans Ably
const before: PollSettings = {
  ablyEnabled: false,
  notificationsPollSeconds: 20,
  realtimeSafetySeconds: 60,
  chatPollSeconds: 10,
  pullFeedRefreshSeconds: 15,
  battlePollSeconds: 2,
  battleSafetySeconds: 15,
  queuePollSeconds: 2.5,
  lobbyPollSeconds: 3,
  marketPollSeconds: 5,
};

describe("estimation de consommation", () => {
  it("compte le sondage de l'en-tête, les pages vues et le fil de l'accueil", () => {
    // 60 sondages (60 s) + 30 pages + 60 rafraîchissements du fil (60 s)
    expect(invocationsPerHour("home", defaults(false))).toBe(150);
    // Avec Ably : sondage de secours à 180 s
    expect(invocationsPerHour("home", defaults(true))).toBe(110);
  });

  it("le combat en direct coûte bien moins que le combat sondé", () => {
    expect(invocationsPerHour("battle", defaults(true))).toBeLessThan(invocationsPerHour("battle", before) / 5);
  });

  it("le chat ouvert ne garde qu'un sondage de secours quand Ably est là", () => {
    const safety = 3600 / SETTING_DEFAULTS["realtime.safetyPollSeconds"];
    expect(invocationsPerHour("chat", defaults(true))).toBe(invocationsPerHour("browse", defaults(true)) + safety);
    expect(invocationsPerHour("chat", defaults(true))).toBeLessThan(invocationsPerHour("chat", defaults(false)));
  });

  it("les nouveaux réglages divisent la consommation horaire", () => {
    expect(blendedPerHour(defaults(true))).toBeLessThan(blendedPerHour(before) / 3);
  });

  it("projette 30 jours et la part du budget mensuel", () => {
    const p = monthlyProjection({ settings: defaults(true), dailyPlayers: 40, hoursPerPlayer: 1, otherPerDay: 0 });
    expect(p.invocations).toBe(Math.round(40 * blendedPerHour(defaults(true)) * 30));
    expect(p.share.invocations).toBeCloseTo(p.invocations / DEFAULT_VERCEL_BUDGET.invocations);
    expect(p.cpuHours).toBeCloseTo((p.invocations * 23) / 3_600_000);
  });

  it("donne le nombre de joueurs tenable, moins le trafic fixe", () => {
    const free = maxDailyPlayers(defaults(true), 1);
    const withBots = maxDailyPlayers(defaults(true), 1, 5_000);
    expect(free).toBeGreaterThan(withBots);
    const at = monthlyProjection({ settings: defaults(true), dailyPlayers: free, hoursPerPlayer: 1 });
    expect(Math.max(at.share.invocations, at.share.cpuHours, at.share.transferGb)).toBeLessThanOrEqual(1);
  });

  it("suit le budget réglé dans /admin", () => {
    const budget = { invocations: 1_000_000, cpuHours: 4, transferGb: 10 };
    const p = monthlyProjection({ settings: defaults(true), dailyPlayers: 40, hoursPerPlayer: 1, budget });
    expect(p.share.invocations).toBeCloseTo(p.invocations / 1_000_000);
    // Budget plus serré : moins de joueurs tenables
    expect(maxDailyPlayers(defaults(true), 1, 0, budget)).toBeLessThan(maxDailyPlayers(defaults(true), 1));
  });
});
