import { describe, expect, it } from "vitest";
import { DEFAULT_KYARA_RULES, type KyaraRules } from "./rules";
import { importDeadline, kyaraEligibility, type KyaraPlayer } from "./window";

const DAY = 86_400_000;
const LAUNCH = Date.parse("2026-12-01T12:00:00Z");
const RULES: KyaraRules = { ...DEFAULT_KYARA_RULES, enabled: true, launchAt: LAUNCH, staffKyaraUserId: "2af84af1-f619-45a3-bc8b-7072d0a8fd10" };

function player(p: Partial<KyaraPlayer> = {}): KyaraPlayer {
  return {
    isGuest: false,
    registeredAt: new Date(LAUNCH - 90 * DAY),
    createdAt: new Date(LAUNCH - 100 * DAY),
    discordLinked: true,
    unavailable: false,
    staff: false,
    ...p,
  };
}

describe("fenêtre de l'import Kyara", () => {
  it("compte d'avant la sortie : 7 jours à partir de la sortie ; inscrit après : 7 jours à partir de l'inscription", () => {
    expect(importDeadline(LAUNCH, LAUNCH - 90 * DAY, LAUNCH - 100 * DAY, 7)).toBe(LAUNCH + 7 * DAY);
    expect(importDeadline(LAUNCH, LAUNCH + 3 * DAY, LAUNCH - 1 * DAY, 7)).toBe(LAUNCH + 10 * DAY);
    // Sans date d'inscription (ancienne ligne) : la création
    expect(importDeadline(LAUNCH, null, LAUNCH + 2 * DAY, 7)).toBe(LAUNCH + 9 * DAY);
  });

  it("ouvert pendant la fenêtre, fermé à son terme (borne exclue)", () => {
    expect(kyaraEligibility(player(), RULES, LAUNCH)).toEqual({ ok: true, deadline: LAUNCH + 7 * DAY });
    expect(kyaraEligibility(player(), RULES, LAUNCH + 7 * DAY - 1).ok).toBe(true);
    expect(kyaraEligibility(player(), RULES, LAUNCH + 7 * DAY)).toEqual({ ok: false, reason: "EXPIRED", deadline: LAUNCH + 7 * DAY, opensAt: null });
    const late = player({ registeredAt: new Date(LAUNCH + 30 * DAY), createdAt: new Date(LAUNCH + 29 * DAY) });
    expect(kyaraEligibility(late, RULES, LAUNCH + 36 * DAY).ok).toBe(true);
  });

  it("coupé, pas encore sorti ou pas configuré : rien pour un joueur", () => {
    expect(kyaraEligibility(player(), { ...RULES, enabled: false }, LAUNCH)).toMatchObject({ ok: false, reason: "DISABLED" });
    expect(kyaraEligibility(player(), RULES, LAUNCH - 1)).toMatchObject({ ok: false, reason: "NOT_LAUNCHED", opensAt: LAUNCH });
    expect(kyaraEligibility(player(), { ...RULES, launchAt: null }, LAUNCH)).toMatchObject({ ok: false, reason: "NOT_LAUNCHED", opensAt: null });
    expect(kyaraEligibility(player(), { ...RULES, staffKyaraUserId: null }, LAUNCH)).toMatchObject({ ok: false, reason: "NOT_LAUNCHED" });
  });

  it("invité, compte indisponible ou sans Discord : la raison est donnée", () => {
    expect(kyaraEligibility(player({ isGuest: true }), RULES, LAUNCH)).toMatchObject({ ok: false, reason: "GUEST" });
    expect(kyaraEligibility(player({ unavailable: true }), RULES, LAUNCH)).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
    expect(kyaraEligibility(player({ discordLinked: false }), RULES, LAUNCH)).toEqual({ ok: false, reason: "NO_DISCORD", deadline: LAUNCH + 7 * DAY, opensAt: null });
    // Fenêtre passée : lier Discord n'y changerait rien
    expect(kyaraEligibility(player({ discordLinked: false }), RULES, LAUNCH + 8 * DAY)).toMatchObject({ reason: "EXPIRED" });
  });

  it("l'équipe peut faire une demande de test même coupé, avant la sortie ou après la fenêtre, mais avec Discord", () => {
    const staff = player({ staff: true });
    expect(kyaraEligibility(staff, { ...RULES, enabled: false, launchAt: null }, LAUNCH)).toEqual({ ok: true, deadline: null });
    expect(kyaraEligibility(staff, RULES, LAUNCH + 30 * DAY).ok).toBe(true);
    expect(kyaraEligibility({ ...staff, discordLinked: false }, RULES, LAUNCH)).toMatchObject({ ok: false, reason: "NO_DISCORD" });
  });
});
