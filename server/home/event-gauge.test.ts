import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({ raw: vi.fn(), settings: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("../db", () => ({ prisma: { $queryRaw: mocks.raw } }));
vi.mock("../settings", () => ({ getSetting: async (key: string) => mocks.settings[key] }));
import { getEventGauge, readEventGauge } from "./event-gauge";

const startsAt = "2026-11-04T18:00:00.000Z";
const endsAt = "2026-11-10T18:00:00.000Z";
const during = Date.parse(startsAt) + 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.raw.mockResolvedValue([{ n: 5000 }]);
  mocks.settings = {
    "home.eventGauge.enabled": true,
    "home.eventGauge.startsAt": startsAt,
    "home.eventGauge.endsAt": endsAt,
    "home.eventGauge.goal": 20_000,
    "home.eventGauge.cacheSeconds": 30,
  };
});

describe("compte de la jauge", () => {
  it("compte les ouvertures des comptes inscrits et non bannis, joueur par joueur, dans la fenêtre [début, fin[", async () => {
    expect(await getEventGauge(during)).toMatchObject({ phase: "live", count: 5000, percent: 25 });
    const query = Prisma.sql(...(mocks.raw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]));
    expect(query.text).toContain(`b."userId" = u.id`);
    expect(query.text).toContain(`u."isGuest" = false AND u."bannedAt" IS NULL`);
    expect(query.values).toEqual([new Date(startsAt), new Date(endsAt)]);
  });

  it("n'interroge pas la base avant le début", async () => {
    expect(await getEventGauge(Date.parse(startsAt) - 1)).toMatchObject({ phase: "upcoming", count: 0 });
    expect(mocks.raw).not.toHaveBeenCalled();
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

// La requête sur le schéma à jour : mêmes ouvertures qu'un compte de la fenêtre joint aux joueurs
describe("compte de la jauge, sur le schéma à jour", () => {
  const db = new PGlite({ extensions: { pg_trgm } });

  beforeAll(async () => {
    const root = resolve("prisma/migrations");
    for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
      await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
    await db.exec(`
      INSERT INTO "User" (id, username, "isGuest") VALUES ('inscrit', 'inscrit', false), ('autre', 'autre', false), ('invite', 'invite', true);
      INSERT INTO "User" (id, username, "isGuest", "bannedAt") VALUES ('banni', 'banni', false, now());
      INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds", "createdAt") VALUES
        ('o1', 'inscrit', 'standard', '{}', '{}', '2026-11-04 18:00:00'),
        ('o2', 'inscrit', 'standard', '{}', '{}', '2026-11-08 12:00:00'),
        ('o3', 'inscrit', 'standard', '{}', '{}', '2026-11-10 18:00:00'),
        ('o4', 'inscrit', 'standard', '{}', '{}', '2026-11-04 17:59:59'),
        ('o5', 'autre', 'standard', '{}', '{}', '2026-11-09 09:00:00'),
        ('o6', 'invite', 'standard', '{}', '{}', '2026-11-05 10:00:00'),
        ('o7', 'banni', 'standard', '{}', '{}', '2026-11-05 10:00:00');`);
  }, 120_000);

  afterAll(() => db.close());

  it("début compris, fin exclue, ni invités ni bannis", async () => {
    mocks.raw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values);
      return (await db.query(query.text, [...query.values])).rows;
    });
    expect(await readEventGauge(during)).toMatchObject({ count: 3 });
    const reference = await db.query<{ n: number }>(`
      SELECT COUNT(*)::int AS n FROM "BoosterOpening" b JOIN "User" u ON u.id = b."userId"
      WHERE b."createdAt" >= '2026-11-04 18:00:00' AND b."createdAt" < '2026-11-10 18:00:00' AND NOT u."isGuest" AND u."bannedAt" IS NULL`);
    expect(reference.rows[0].n).toBe(3);
  });
});
