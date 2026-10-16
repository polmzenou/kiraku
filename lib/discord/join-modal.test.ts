import { describe, expect, it } from "vitest";
import { JOIN_MODAL_DEFAULT, joinModalEligible, joinModalSchema, laterCooldownOver } from "./join-modal";

const on = { ...JOIN_MODAL_DEFAULT, enabled: true, inviteUrl: "https://discord.gg/kiraku" };
const DAY = 86_400_000;

describe("modal Discord", () => {
  it("désactivé par défaut", () => {
    expect(JOIN_MODAL_DEFAULT.enabled).toBe(false);
    expect(joinModalSchema.safeParse(JOIN_MODAL_DEFAULT).success).toBe(true);
    expect(joinModalEligible(JOIN_MODAL_DEFAULT, { discordJoinedAt: null, boostersOpened: 99 })).toBe(false);
  });

  it("n'accepte que les liens d'invitation Discord en https", () => {
    for (const ok of ["https://discord.gg/kiraku", "https://discord.com/invite/Ab-12", ""]) {
      expect(joinModalSchema.safeParse({ ...JOIN_MODAL_DEFAULT, inviteUrl: ok }).success, ok).toBe(true);
    }
    for (const bad of [
      "http://discord.gg/kiraku",
      "https://discord.gg.evil.com/x",
      "https://evil.com/discord.gg/x",
      "javascript:alert(1)",
      "https://discord.com/channels/1/2",
      "https://discord.gg/<script>",
    ]) {
      expect(joinModalSchema.safeParse({ ...JOIN_MODAL_DEFAULT, inviteUrl: bad }).success, bad).toBe(false);
    }
  });

  it("refuse l'activation sans lien", () => {
    expect(joinModalSchema.safeParse({ ...JOIN_MODAL_DEFAULT, enabled: true, inviteUrl: "" }).success).toBe(false);
  });

  it("déclencheurs : après N boosters, ou dès la visite ; jamais après « Rejoindre »", () => {
    expect(joinModalEligible(on, { discordJoinedAt: null, boostersOpened: 2 })).toBe(false);
    expect(joinModalEligible(on, { discordJoinedAt: null, boostersOpened: 3 })).toBe(true);
    expect(joinModalEligible({ ...on, trigger: "ON_VISIT" }, { discordJoinedAt: null, boostersOpened: 0 })).toBe(true);
    expect(joinModalEligible(on, { discordJoinedAt: new Date(), boostersOpened: 50 })).toBe(false);
  });

  it("« Plus tard » repousse de cooldownDays jours", () => {
    const now = Date.UTC(2026, 9, 16);
    expect(laterCooldownOver(null, 7, now)).toBe(true);
    expect(laterCooldownOver(now - 6 * DAY, 7, now)).toBe(false);
    expect(laterCooldownOver(now - 7 * DAY, 7, now)).toBe(true);
    expect(laterCooldownOver(Number.NaN, 7, now)).toBe(true);
  });
});
