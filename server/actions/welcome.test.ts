import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), rateLimit: vi.fn() }));
vi.mock("../user", () => ({ requireActiveUser: mocks.user }));
vi.mock("../db", () => ({ prisma: { user: { updateMany: mocks.updateMany }, pollVote: { upsert: mocks.upsert } } }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
import { ANNOUNCEMENTS } from "@/lib/welcome/release";
import { claimAnnouncementAction, voteDiscordPollAction } from "./welcome";

const [apology, v2, v25] = ANNOUNCEMENTS;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: null });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.updateMany.mockResolvedValue({ count: 1 });
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

  it("présente la v2.5 une fois la v2 vue", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: v2.at });
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(await claimAnnouncementAction("player", "v25")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { v1WelcomeSeenAt: v25.at } }));
  });

  it("la v2.5 remplace l'attente de la v3, déjà vue ou non", async () => {
    mocks.user.mockResolvedValue({ id: "player", v1WelcomeSeenAt: new Date("2026-10-28T12:00:00Z") });
    expect(await claimAnnouncementAction("player", "v3Teaser")).toBe(false);
    expect(await claimAnnouncementAction("player", "v25")).toBe(true);
  });

  it("enregistre la date de l'annonce sur le joueur de la session", async () => {
    expect(await claimAnnouncementAction("player", "v25")).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "player",
        OR: [{ v1WelcomeSeenAt: null }, { v1WelcomeSeenAt: { lt: v25.at } }],
        bannedAt: null,
        deletionRequestedAt: null,
        anonymizedAt: null,
      },
      data: { v1WelcomeSeenAt: v25.at },
    });
  });

  it("n'autorise qu'un seul de deux appareils ou onglets simultanés", async () => {
    let seen = false;
    mocks.updateMany.mockImplementation(async () => {
      if (seen) return { count: 0 };
      seen = true;
      return { count: 1 };
    });
    expect(await Promise.all([claimAnnouncementAction("player", "v25"), claimAnnouncementAction("player", "v25")])).toEqual([true, false]);
  });

  it("ne marque rien lorsque la limite est atteinte", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await claimAnnouncementAction("player", "v2")).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("sondage Discord de la v2.5", () => {
  it("refuse les visiteurs et les réponses invalides", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await voteDiscordPollAction(true)).toBe(false);
    mocks.user.mockResolvedValue({ id: "player" });
    expect(await voteDiscordPollAction("oui")).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("un vote par joueur : une nouvelle réponse remplace l'ancienne", async () => {
    expect(await voteDiscordPollAction(false)).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_poll: { userId: "player", poll: "discord-community" } },
      create: { userId: "player", poll: "discord-community", answer: false },
      update: { answer: false },
    });
  });

  it("n'écrit rien lorsque la limite est atteinte", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await voteDiscordPollAction(true)).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
