import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_RANKED_RULES as rules } from "@/lib/ranked/defaults";
import { seasonSnapshot, type SeasonStandingRow } from "./snapshot";
import { rollSeasonWith } from "./ranked-core";

const now = new Date("2026-11-01T12:00:00Z");
const row = (position: number, pc: number, isPublic = true): SeasonStandingRow => ({ position, ahead: position - 1, pc, public: isPublic, total: 3, username: `joueur${position}`, image: null });

describe("classement public figé", () => {
  it("masque les profils privés en conservant les positions et le total", () => {
    const snapshot = seasonSnapshot([row(1, 2000, false), row(2, 1900), row(3, 1700)], 4, now, rules);
    expect(snapshot.entries.map((entry) => entry.position)).toEqual([2, 3]);
    expect(snapshot.entries.map((entry) => entry.tier)).toEqual(["GRAND_CHAMPION", "CHAMPION"]);
    expect(JSON.stringify(snapshot)).not.toContain("joueur1");
    expect(snapshot).toMatchObject({ number: 4, nextNumber: 5, total: 3 });
  });
  it("traite les ex æquo du seuil Grand Champion comme le jeu", () => {
    const snapshot = seasonSnapshot([{ ...row(101, 1800), ahead: 99 }], 4, now, rules);
    expect(snapshot.entries[0].tier).toBe("GRAND_CHAMPION");
  });
});

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT, image TEXT, "createdAt" TIMESTAMP,
    "rankPoints" INT, "isGuest" BOOLEAN DEFAULT false, "bannedAt" TIMESTAMP, "profileVisibility" TEXT DEFAULT 'PUBLIC',
    "seasonPeakPc" INT, "seasonPeakGrand" BOOLEAN DEFAULT false, "seasonGames" INT DEFAULT 1, "rankProtection" INT DEFAULT 0);
    CREATE TABLE "Season" (id TEXT PRIMARY KEY, number INT UNIQUE, "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, "closedAt" TIMESTAMP, "leaderboardSnapshot" JSONB);
    CREATE TABLE "SeasonResult" ("seasonId" TEXT, "userId" TEXT, "finalPc" INT, "peakPc" INT, "peakTier" TEXT, games INT, "lotId" TEXT, "createdAt" TIMESTAMP, UNIQUE("seasonId", "userId"));
    INSERT INTO "Season" (id, number, "startsAt", "endsAt") VALUES ('s4', 4, '2026-09-01', '2026-11-01');
    INSERT INTO "User" (id,username,"createdAt","rankPoints","seasonPeakPc","profileVisibility") VALUES
      ('u1','Privé','2026-10-01',3100,3100,'PRIVATE'), ('u2','rover','2026-10-02',3000,3000,'PUBLIC'),
      ('u3','Kata','2026-10-03',1711,1711,'PUBLIC');`);
}, 30_000);
afterAll(async () => pg.close());

it("enregistre le bilan et le classement avant le reset dans la même transaction Postgres", async () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => Prisma.sql(strings, ...values);
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = sql(strings, ...values);
      return (await pg.query(query.text, query.values)).rows;
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = sql(strings, ...values);
      return (await pg.query(query.text, query.values)).affectedRows;
    },
    season: {
      update: async ({ where, data }: { where: { id: string }; data: { closedAt: Date; endsAt: Date; leaderboardSnapshot: unknown } }) =>
        pg.query('UPDATE "Season" SET "closedAt"=$1, "endsAt"=$2, "leaderboardSnapshot"=$3 WHERE id=$4', [data.closedAt, data.endsAt, JSON.stringify(data.leaderboardSnapshot), where.id]),
      create: async ({ data }: { data: { number: number; startsAt: Date; endsAt: Date } }) =>
        pg.query('INSERT INTO "Season" (id,number,"startsAt","endsAt") VALUES ($1,$2,$3,$4)', [`s${data.number}`, data.number, data.startsAt, data.endsAt]),
    },
  };
  const db = {
    season: { findFirst: async () => (await pg.query('SELECT * FROM "Season" WHERE "closedAt" IS NULL ORDER BY number DESC LIMIT 1')).rows[0] },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      await pg.exec("BEGIN");
      try { const result = await callback(tx); await pg.exec("COMMIT"); return result; }
      catch (error) { await pg.exec("ROLLBACK"); throw error; }
    },
  } as unknown as PrismaClient;
  expect(await rollSeasonWith(db, now, rules, "Europe/Paris")).toMatchObject({ closed: { number: 4 }, results: 3 });
  const frozen = (await pg.query<{ leaderboardSnapshot: { entries: { username: string; pc: number; position: number }[] } }>('SELECT "leaderboardSnapshot" FROM "Season" WHERE id=\'s4\'')).rows[0].leaderboardSnapshot;
  expect(frozen.entries.map(({ username, pc, position }) => ({ username, pc, position }))).toEqual([
    { username: "rover", pc: 3000, position: 2 }, { username: "Kata", pc: 1711, position: 3 },
  ]);
  expect((await pg.query('SELECT "rankPoints" FROM "User" WHERE id=\'u2\'')).rows).toEqual([{ rankPoints: 1800 }]);
  expect((await pg.query('SELECT "finalPc" FROM "SeasonResult" WHERE "userId"=\'u2\'')).rows).toEqual([{ finalPc: 3000 }]);
  expect(await rollSeasonWith(db, now, rules, "Europe/Paris")).toEqual({ closed: null, results: 0 });
});
