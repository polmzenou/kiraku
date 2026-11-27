import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), updateMany: vi.fn(), rateLimit: vi.fn(), casinoRules: vi.fn(), setting: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../user", () => ({ requireActiveUser: mocks.user }));
vi.mock("../db", () => ({ prisma: { user: { updateMany: mocks.updateMany } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../casino/queries", () => ({ getCasinoRules: mocks.casinoRules }));
vi.mock("../settings", () => ({ getSetting: mocks.setting }));
import { DEFAULT_CASINO_RULES } from "@/lib/casino/rules";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings/defaults";
import { ANNOUNCEMENTS } from "@/lib/welcome/release";
import { claimAnnouncementAction } from "./welcome";

const [apology, v2, v25] = ANNOUNCEMENTS;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: null });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.casinoRules.mockResolvedValue(DEFAULT_CASINO_RULES);
  // Réglages par défaut : parrainage v2 coupé, pas d'annonce datée
  mocks.setting.mockImplementation(async (key: SettingKey) => SETTING_DEFAULTS[key]);
});

describe("annonces uniques par compte", () => {
  it("refuse les visiteurs et les comptes inactifs", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("ne réserve jamais l'affichage d'un autre compte", async () => {
    expect(await claimAnnouncementAction("another-player", "v2")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [null, "v2"],
    [42, "v2"],
    [{}, "v2"],
    ["", "v2"],
    ["x".repeat(129), "v2"],
    ["player", "v3"],
    ["player", null],
  ])("refuse une entrée invalide : %j, %j", async (userId, key) => {
    expect(await claimAnnouncementAction(userId, key)).toBe(false);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("ne représente pas une annonce après reconnexion ou changement d'appareil", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: v25.at });
    expect(await claimAnnouncementAction("player", "v25")).toBe(false);
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("présente les excuses avant la v2 à qui ne les avait pas vues", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: new Date(apology.at.getTime() - 1000) });
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(await claimAnnouncementAction("player", "apology")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { v1WelcomeSeenAt: apology.at } }));
  });

  it("présente la v2 une fois les excuses vues", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: apology.at });
    expect(await claimAnnouncementAction("player", "v2")).toBe(true);
  });

  it("la v2.5, borne sans modal, ne se réserve pas : ni après la v2, ni pour un compte neuf", async () => {
    for (const seenAt of [v2.at, new Date("2026-10-28T12:00:00Z"), null]) {
      mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: seenAt });
      expect(await claimAnnouncementAction("player", "v2")).toBe(false);
      expect(await claimAnnouncementAction("player", "v25")).toBe(false);
      expect(await claimAnnouncementAction("player", "v3Teaser")).toBe(false);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("enregistre la date de l'annonce sur le joueur de la session", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: apology.at });
    expect(await claimAnnouncementAction("player", "v2")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "player",
        OR: [{ v1WelcomeSeenAt: null }, { v1WelcomeSeenAt: { lt: v2.at } }],
        bannedAt: null,
        deletionRequestedAt: null,
        anonymizedAt: null,
      },
      data: { v1WelcomeSeenAt: v2.at },
    });
  });

  it("n'autorise qu'un seul de deux appareils ou onglets simultanés", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: apology.at });
    let seen = false;
    mocks.updateMany.mockImplementation(async () => {
      if (seen) return { count: 0 };
      seen = true;
      return { count: 1 };
    });
    expect(await Promise.all([claimAnnouncementAction("player", "v2"), claimAnnouncementAction("player", "v2")])).toEqual([true, false]);
  });

  it("ne marque rien lorsque la limite est atteinte", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("annonce de l'ouverture du casino", () => {
  const DAY = 86_400_000;
  const opened = (daysAgo: number) => ({ ...DEFAULT_CASINO_RULES, opensAt: Date.now() - daysAgo * DAY });
  const veteran = { id: "player", isGuest: false, createdAt: new Date(Date.now() - 60 * DAY), v1WelcomeSeenAt: v25.at };

  it("présentée une fois aux comptes inscrits avant l'ouverture, pendant la fenêtre de lancement", async () => {
    // Une seule lecture de l'horloge : deux appels à opened() peuvent tomber sur deux millisecondes
    const rules = opened(1);
    mocks.casinoRules.mockResolvedValue(rules);
    mocks.user.mockResolvedValue(veteran);
    expect(await claimAnnouncementAction("player", "casino")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { v1WelcomeSeenAt: new Date(rules.opensAt!) } }));
  });

  it("jamais aux invités, ni aux comptes créés après l'ouverture, ni après la fenêtre", async () => {
    mocks.casinoRules.mockResolvedValue(opened(1));
    mocks.user.mockResolvedValue({ ...veteran, isGuest: true });
    expect(await claimAnnouncementAction("player", "casino")).toBe(false);
    mocks.user.mockResolvedValue({ ...veteran, createdAt: new Date() });
    expect(await claimAnnouncementAction("player", "casino")).toBe(false);
    mocks.casinoRules.mockResolvedValue(opened(30));
    mocks.user.mockResolvedValue(veteran);
    expect(await claimAnnouncementAction("player", "casino")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("aussi à qui a vu la v2 ou les excuses sans jamais passer la borne v2.5", async () => {
    const rules = opened(1);
    mocks.casinoRules.mockResolvedValue(rules);
    mocks.user.mockResolvedValue({ ...veteran, v1WelcomeSeenAt: v2.at });
    expect(await claimAnnouncementAction("player", "casino")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { v1WelcomeSeenAt: new Date(rules.opensAt!) } }));
    // Les excuses seulement : la v2 d'abord, le casino à la visite suivante
    mocks.user.mockResolvedValue({ ...veteran, v1WelcomeSeenAt: apology.at });
    expect(await claimAnnouncementAction("player", "casino")).toBe(false);
    expect(await claimAnnouncementAction("player", "v2")).toBe(true);
  });

  it("pas avant l'ouverture", async () => {
    mocks.casinoRules.mockResolvedValue({ ...DEFAULT_CASINO_RULES, opensAt: Date.now() + DAY });
    mocks.user.mockResolvedValue(veteran);
    expect(await claimAnnouncementAction("player", "casino")).toBe(false);
  });
});

describe("annonce du nouveau parrainage", () => {
  const DAY = 86_400_000;
  const veteran = { id: "player", isGuest: false, createdAt: new Date(Date.now() - 60 * DAY), v1WelcomeSeenAt: v25.at };
  const announced = (at: string | null, enabled = true) =>
    mocks.setting.mockImplementation(async (key: SettingKey) =>
      key === "referral.v2.enabled" ? enabled : key === "referral.v2.announceAt" ? at : SETTING_DEFAULTS[key],
    );

  it("présentée une fois aux comptes inscrits avant la date, parrainage v2 allumé", async () => {
    const at = new Date(Date.now() - DAY).toISOString();
    announced(at);
    mocks.user.mockResolvedValue(veteran);
    expect(await claimAnnouncementAction("player", "referral")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { v1WelcomeSeenAt: new Date(at) } }));
  });

  it("aussi à qui s'était arrêté avant la borne v2.5", async () => {
    announced(new Date(Date.now() - DAY).toISOString());
    mocks.user.mockResolvedValue({ ...veteran, v1WelcomeSeenAt: v2.at });
    expect(await claimAnnouncementAction("player", "referral")).toBe(true);
  });

  it("rien sans date, parrainage v2 coupé, ni pour un compte créé après l'annonce", async () => {
    mocks.user.mockResolvedValue(veteran);
    announced(null);
    expect(await claimAnnouncementAction("player", "referral")).toBe(false);
    announced(new Date(Date.now() - DAY).toISOString(), false);
    expect(await claimAnnouncementAction("player", "referral")).toBe(false);
    announced(new Date(Date.now() - DAY).toISOString());
    mocks.user.mockResolvedValue({ ...veteran, createdAt: new Date() });
    expect(await claimAnnouncementAction("player", "referral")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
