import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rate: vi.fn(), rules: vi.fn(), season: vi.fn(), capture: vi.fn(), image: vi.fn() }));
vi.mock("@/server/admin", () => ({ getAdmin: mocks.admin }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/server/db", () => ({ prisma: { season: { findFirst: mocks.season } } }));
vi.mock("@/server/ranked/queries", () => ({ getRankedRules: mocks.rules }));
vi.mock("@/server/ranked/snapshot", () => ({ captureSeasonSnapshot: mocks.capture }));
vi.mock("@/server/discord/season-image", () => ({ seasonImage: mocks.image }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.season.mockResolvedValue({ number: 4 });
  mocks.capture.mockResolvedValue({ number: 4 });
  mocks.image.mockImplementation(async () => new Response("png", { headers: { "content-type": "image/png" } }));
});

describe("aperçu privé du classement", () => {
  it("exige un administrateur et une limite d'appels", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
    expect(mocks.capture).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ id: "admin" });
    mocks.rate.mockResolvedValue({ success: false });
    expect((await GET()).status).toBe(429);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("rend le classement actuel sans écrire ni clore une saison", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.image).toHaveBeenCalledWith({ number: 4 }, true, true);
    expect(mocks.capture.mock.calls[0][1]).toBe(4);
  });
});
