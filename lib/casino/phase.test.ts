import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { announcementDue, casinoAccess, casinoBadge, casinoPhase, inLaunchWindow } from "./phase";
import { casinoRulesFrom, DEFAULT_CASINO_RULES, parseOpensAt, type CasinoRules } from "./rules";

const DAY = 86_400_000;
const OPENS = Date.parse("2026-12-01T19:00:00.000Z");

const rules = (over: Partial<CasinoRules> = {}): CasinoRules => ({ ...DEFAULT_CASINO_RULES, opensAt: OPENS, ...over });

describe("réglages du casino", () => {
  it("par défaut : visible, sans date (teaser comme avant), badge 7 jours", () => {
    expect(DEFAULT_CASINO_RULES).toMatchObject({ visible: true, opensAt: null, newBadgeDays: 7, minAccountAgeHours: 48 });
    expect(DEFAULT_CASINO_RULES.coinflip).toMatchObject({ enabled: true, expiryHours: 24, maxOpenTables: 3, dailyLimit: 20, lastCopyAllowed: true });
  });

  it("lit la date d'ouverture enregistrée", () => {
    const r = casinoRulesFrom((key) => (key === "casino.opensAt" ? "2026-12-01T19:00:00.000Z" : SETTING_DEFAULTS[key]) as never);
    expect(r.opensAt).toBe(OPENS);
  });

  it("une date illisible compte comme absente", () => {
    expect(parseOpensAt(null)).toBeNull();
    expect(parseOpensAt("pas une date")).toBeNull();
  });
});

describe("phase", () => {
  it("caché quand l'interrupteur est éteint, quelle que soit la date", () => {
    expect(casinoPhase(rules({ visible: false }), OPENS + DAY)).toBe("hidden");
  });

  it("teaser sans date, ou avant l'ouverture", () => {
    expect(casinoPhase(rules({ opensAt: null }), OPENS)).toBe("teaser");
    expect(casinoPhase(rules(), OPENS - 1)).toBe("teaser");
  });

  it("ouvert pile à l'heure dite", () => {
    expect(casinoPhase(rules(), OPENS)).toBe("open");
  });
});

describe("accès", () => {
  it("avant l'ouverture, les joueurs voient le teaser et les admins un aperçu", () => {
    expect(casinoAccess(rules(), OPENS - 1, false)).toEqual({ phase: "teaser", canEnter: false, preview: false });
    expect(casinoAccess(rules(), OPENS - 1, true)).toEqual({ phase: "teaser", canEnter: true, preview: true });
  });

  it("caché : aperçu admin seulement", () => {
    expect(casinoAccess(rules({ visible: false }), OPENS + DAY, false).canEnter).toBe(false);
    expect(casinoAccess(rules({ visible: false }), OPENS + DAY, true)).toMatchObject({ canEnter: true, preview: true });
  });

  it("ouvert : tout le monde entre, sans bandeau d'aperçu", () => {
    expect(casinoAccess(rules(), OPENS, true)).toEqual({ phase: "open", canEnter: true, preview: false });
  });
});

describe("lancement : badge, cérémonie, annonce", () => {
  it("fenêtre de lancement [ouverture, ouverture + 7 j[", () => {
    expect(inLaunchWindow(rules(), OPENS - 1)).toBe(false);
    expect(inLaunchWindow(rules(), OPENS)).toBe(true);
    expect(inLaunchWindow(rules(), OPENS + 7 * DAY - 1)).toBe(true);
    expect(inLaunchWindow(rules(), OPENS + 7 * DAY)).toBe(false);
    expect(inLaunchWindow(rules({ newBadgeDays: 0 }), OPENS)).toBe(false);
  });

  it("badge « Bientôt » au teaser, « Nouveau » pendant la fenêtre, rien ensuite", () => {
    expect(casinoBadge(rules({ opensAt: null }), OPENS)).toBe("soon");
    expect(casinoBadge(rules(), OPENS - 1)).toBe("soon");
    expect(casinoBadge(rules(), OPENS + DAY)).toBe("new");
    expect(casinoBadge(rules(), OPENS + 8 * DAY)).toBeNull();
    expect(casinoBadge(rules({ visible: false }), OPENS + DAY)).toBeNull();
  });

  it("annonce aux comptes inscrits avant l'ouverture, jamais aux invités", () => {
    const before = new Date(OPENS - DAY);
    const after = new Date(OPENS + 60_000);
    expect(announcementDue(rules(), OPENS + DAY, { isGuest: false, createdAt: before })).toBe(true);
    expect(announcementDue(rules(), OPENS + DAY, { isGuest: true, createdAt: before })).toBe(false);
    expect(announcementDue(rules(), OPENS + DAY, { isGuest: false, createdAt: after })).toBe(false);
    expect(announcementDue(rules(), OPENS - 1, { isGuest: false, createdAt: before })).toBe(false);
    expect(announcementDue(rules(), OPENS + 8 * DAY, { isGuest: false, createdAt: before })).toBe(false);
  });
});
