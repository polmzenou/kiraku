import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), market: vi.fn(), seasons: vi.fn(), roles: vi.fn() }));
vi.mock("@/server/cron-auth", () => ({ cronAuthorized: mocks.auth }));
vi.mock("@/server/discord/market", () => ({ syncDiscordMarket: mocks.market }));
vi.mock("@/server/discord/seasons", () => ({ syncDiscordSeasons: mocks.seasons }));
vi.mock("@/server/discord/roles", () => ({ syncLinkedDiscordRoles: mocks.roles }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue(true);
  mocks.market.mockResolvedValue({ synced: 2, failed: 0 });
  mocks.seasons.mockResolvedValue({ published: 1, failed: 0 });
  mocks.roles.mockResolvedValue({ synced: 3, deferred: 0 });
});
const request = () => new Request("https://kiraku.example/api/cron/discord");

describe("cron Discord commun", () => {
  it("refuse un appel non authentifié avant tout traitement", async () => {
    mocks.auth.mockReturnValue(false);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.seasons).not.toHaveBeenCalled();
    expect(mocks.roles).not.toHaveBeenCalled();
    expect(mocks.market).not.toHaveBeenCalled();
  });
  it("traite les trois fonctions avec la ligne cron existante", async () => {
    expect(await (await GET(request())).json()).toEqual({ synced: 2, failed: 0, linkedRoles: { synced: 3, deferred: 0 }, ranked: { published: 1, failed: 0 } });
    expect(mocks.market.mock.calls[0][0]).toBe(mocks.seasons.mock.calls[0][0]);
  });
  it("continue le marché si les nouvelles fonctions échouent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.seasons.mockRejectedValueOnce(new Error("private"));
    mocks.roles.mockRejectedValueOnce(new Error("private"));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ synced: 2, failed: 0, linkedRoles: { deferred: 1 }, ranked: { failed: 1 } });
    expect(mocks.market).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    warn.mockRestore();
  });
});
