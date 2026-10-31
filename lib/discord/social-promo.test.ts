import { describe, expect, it } from "vitest";
import { SOCIAL_PROMO_DEFAULT, socialPromoSchema, socialPromoState, socialPromoVisible } from "./social-promo";

const on = { ...SOCIAL_PROMO_DEFAULT, enabled: true, inviteUrl: "https://discord.gg/kiraku" };
const now = new Date("2026-11-01T12:00:00Z");
const iso = (s: string) => new Date(s).toISOString();

describe("section Discord de la page Social", () => {
  it("masquée par défaut", () => {
    expect(SOCIAL_PROMO_DEFAULT.enabled).toBe(false);
    expect(socialPromoSchema.safeParse(SOCIAL_PROMO_DEFAULT).success).toBe(true);
    expect(socialPromoVisible(SOCIAL_PROMO_DEFAULT, now)).toBe(false);
  });

  it("n'accepte que les liens d'invitation Discord en https", () => {
    expect(socialPromoSchema.safeParse(on).success).toBe(true);
    for (const bad of ["http://discord.gg/kiraku", "https://evil.com/discord.gg/x", "javascript:alert(1)"]) {
      expect(socialPromoSchema.safeParse({ ...on, inviteUrl: bad }).success, bad).toBe(false);
    }
  });

  it("refuse l'affichage sans lien et une fin avant le début", () => {
    expect(socialPromoSchema.safeParse({ ...on, inviteUrl: "" }).success).toBe(false);
    expect(socialPromoSchema.safeParse({ ...on, startsAt: iso("2026-11-02T00:00:00Z"), endsAt: iso("2026-11-01T00:00:00Z") }).success).toBe(false);
    expect(socialPromoSchema.safeParse({ ...on, startsAt: "pas une date" }).success).toBe(false);
    expect(socialPromoSchema.safeParse({ ...on, startsAt: iso("2026-11-01T00:00:00Z"), endsAt: null }).success).toBe(true);
  });

  it("s'affiche avec l'interrupteur seul quand il n'y a pas de dates", () => {
    expect(socialPromoState(on, now)).toBe("LIVE");
    expect(socialPromoState({ ...on, enabled: false }, now)).toBe("OFF");
  });

  it("respecte la fenêtre d'affichage, fin exclue", () => {
    const slot = { ...on, startsAt: iso("2026-11-01T10:00:00Z"), endsAt: iso("2026-11-01T14:00:00Z") };
    expect(socialPromoState(slot, new Date("2026-11-01T09:59:59Z"))).toBe("SCHEDULED");
    expect(socialPromoState(slot, new Date("2026-11-01T10:00:00Z"))).toBe("LIVE");
    expect(socialPromoState(slot, now)).toBe("LIVE");
    expect(socialPromoState(slot, new Date("2026-11-01T14:00:00Z"))).toBe("ENDED");
    expect(socialPromoVisible({ ...slot, enabled: false }, now)).toBe(false);
  });
});
