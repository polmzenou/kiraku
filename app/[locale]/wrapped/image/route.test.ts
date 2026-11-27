import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  user: vi.fn(),
  rate: vi.fn(),
  phase: vi.fn(),
  wrapped: vi.fn(),
  byUsername: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/server/admin", () => ({ getAdmin: mocks.admin }));
vi.mock("@/server/user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/server/wrapped/queries", () => ({ getWrappedPhase: mocks.phase, getWrapped: mocks.wrapped, getWrappedByUsername: mocks.byUsername }));
vi.mock("@/server/wrapped/story-image", () => ({ renderWrappedStory: mocks.render }));
vi.mock("@/server/wrapped/story-labels", () => ({ storyLabels: async () => ({}) }));
vi.mock("@/server/og/assets", () => ({ ogFonts: async () => [], ogSeal: async () => "seal", remoteImage: async () => null }));
import { GET } from "./route";

const player = { id: "joueur", bannedAt: null, deletionRequestedAt: null, anonymizedAt: null };
const summary = { year: 2026, boosters: { opened: 3 }, bestPull: null, favorite: null };
const get = (query = "") => GET(new Request(`https://kiraku.test/wrapped/image${query}`), { params: Promise.resolve({ locale: "fr" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(null);
  mocks.user.mockResolvedValue(player);
  mocks.rate.mockResolvedValue({ success: true });
  mocks.phase.mockResolvedValue({ settings: { year: 2026 }, phase: "open" });
  mocks.wrapped.mockResolvedValue(summary);
  mocks.render.mockImplementation((_s: unknown, _l: unknown, _a: unknown, headers: Record<string, string>) => new Response("png", { headers }));
});

describe("image story du Wrapped", () => {
  it("celle du joueur connecté, gardée par le navigateur selon la session", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(mocks.wrapped).toHaveBeenCalledWith("joueur", 2026);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("refusée à un compte banni ou gelé, comme la page", async () => {
    for (const patch of [{ bannedAt: new Date() }, { deletionRequestedAt: new Date() }, { anonymizedAt: new Date() }]) {
      mocks.user.mockResolvedValueOnce({ ...player, ...patch });
      expect((await get()).status).toBe(404);
    }
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("limitée par joueur : au-delà, rien n'est dessiné", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    const response = await get();
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rate.mock.calls[0][0]).toBe("wrapped-image:joueur");
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("le pseudo d'un autre joueur : admin seulement, limité sur son compte", async () => {
    expect((await get("?u=Akane")).status).toBe(404);
    expect(mocks.byUsername).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ id: "admin" });
    mocks.byUsername.mockResolvedValue(summary);
    expect((await get("?u=Akane")).status).toBe(200);
    expect(mocks.byUsername).toHaveBeenCalledWith("Akane", 2026);
    expect(mocks.rate.mock.calls[0][0]).toBe("wrapped-image:admin");
  });

  it("hors période : 404 pour un joueur", async () => {
    mocks.phase.mockResolvedValue({ settings: { year: 2026 }, phase: "closed" });
    expect((await get()).status).toBe(404);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
});
