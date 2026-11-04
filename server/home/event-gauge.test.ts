import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), settings: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("../db", () => ({ prisma: { boosterOpening: { count: mocks.count } } }));
vi.mock("../settings", () => ({ getSetting: async (key: string) => mocks.settings[key] }));
import { getEventGauge, readEventGauge } from "./event-gauge";

const startsAt = "2026-11-04T18:00:00.000Z";
const endsAt = "2026-11-10T18:00:00.000Z";
const during = Date.parse(startsAt) + 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(5000);
  mocks.settings = {
    "home.eventGauge.enabled": true,
    "home.eventGauge.startsAt": startsAt,
    "home.eventGauge.endsAt": endsAt,
    "home.eventGauge.goal": 20_000,
    "home.eventGauge.cacheSeconds": 30,
  };
});

describe("compte de la jauge", () => {
  it("ne compte que les comptes inscrits et non bannis, dans la fenêtre [début, fin[", async () => {
    expect(await getEventGauge(during)).toMatchObject({ phase: "live", count: 5000, percent: 25 });
    expect(mocks.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date(startsAt), lt: new Date(endsAt) }, user: { isGuest: false, bannedAt: null } },
    });
  });

  it("n'interroge pas la base avant le début", async () => {
    expect(await getEventGauge(Date.parse(startsAt) - 1)).toMatchObject({ phase: "upcoming", count: 0 });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("garde le total après la fin", async () => {
    expect(await getEventGauge(Date.parse(endsAt))).toMatchObject({ phase: "ended", count: 5000 });
  });

  it("disparaît de l'accueil quand l'admin la coupe, mais reste lisible dans l'admin", async () => {
    mocks.settings["home.eventGauge.enabled"] = false;
    expect(await getEventGauge(during)).toBeNull();
    expect(await readEventGauge(during)).toMatchObject({ count: 5000 });
  });
});
