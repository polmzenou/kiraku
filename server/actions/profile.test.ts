import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rateLimit: vi.fn(),
  options: vi.fn(),
  badges: vi.fn(),
  findUser: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../profile/progress", () => ({ getCosmeticOptions: mocks.options, getEarnedBadges: mocks.badges }));
vi.mock("../db", () => ({ prisma: { user: { findUniqueOrThrow: mocks.findUser, update: mocks.update } } }));
import { saveProfileAction } from "./profile";

const option = (id: string, kind: "TITLE" | "FRAME" | "NAME_COLOR", unlocked: boolean) => ({ id, kind, progress: { unlocked, current: 0, goal: 1 } });
const input = (patch: Record<string, unknown> = {}) => ({ bio: "", titleAgreement: "MASC", titleId: null, frameId: null, nameColorId: null, badgeOrder: [], ...patch });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player", isGuest: false, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null, discordLinkedAt: null });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.badges.mockResolvedValue([]);
  mocks.findUser.mockResolvedValue({ createdAt: new Date(), titleId: null, frameId: null, nameColorId: null });
  mocks.options.mockResolvedValue([option("lime", "NAME_COLOR", true), option("rainbow", "NAME_COLOR", false), option("kumo", "FRAME", true)]);
  mocks.update.mockResolvedValue({ id: "player" });
});

describe("couleur du pseudo", () => {
  it("porte une couleur débloquée", async () => {
    expect(await saveProfileAction(input({ nameColorId: "lime" }))).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nameColorId: "lime" }) }));
  });

  it("refuse une couleur verrouillée ou un cosmétique d'un autre type", async () => {
    expect(await saveProfileAction(input({ nameColorId: "rainbow" }))).toEqual({ ok: false, error: "LOCKED" });
    expect(await saveProfileAction(input({ nameColorId: "kumo" }))).toEqual({ ok: false, error: "LOCKED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("garde une couleur déjà portée même repassée sous son palier", async () => {
    mocks.findUser.mockResolvedValue({ createdAt: new Date(), titleId: null, frameId: null, nameColorId: "rainbow" });
    expect(await saveProfileAction(input({ nameColorId: "rainbow", bio: "Bonjour" }))).toEqual({ ok: true });
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it("refuse un champ inconnu venu du client", async () => {
    expect(await saveProfileAction({ ...input(), coins: 1_000_000 })).toEqual({ ok: false, error: "INVALID" });
  });
});
