import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), limit: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: mocks.limit, clientIp: async () => "1.2.3.4" }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ success: true });
  mocks.query.mockResolvedValue([{ "?column?": 1 }]);
});
afterEach(() => vi.useRealTimers());

describe("sonde de santé", () => {
  it("répond 200 quand la base répond, sans mise en cache", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("répond 503 sans aucun détail quand la base est en erreur", async () => {
    mocks.query.mockRejectedValue(new Error("Your account or project has exceeded the quota"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(JSON.stringify({ ok: false }));
  });

  it("répond 503 quand la base ne répond pas à temps", async () => {
    vi.useFakeTimers();
    mocks.query.mockReturnValue(new Promise(() => {}));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await pending).status).toBe(503);
  });

  it("limite les appels par IP avant de toucher la base", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect((await GET()).status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith("health:1.2.3.4", expect.anything(), { store: "memory" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
