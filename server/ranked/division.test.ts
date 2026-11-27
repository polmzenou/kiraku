import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { divisionRange, rankedRulesFrom, rankOf } from "@/lib/ranked/rules";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";

const reader = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
// user.findMany : bans relus après le cache (server/social/banned.ts), aucun ici depuis le calcul
vi.mock("../db", () => ({ prisma: { $queryRaw: reader.query, user: { findMany: async () => [] } } }));
vi.mock("../settings", () => ({ getSetting: vi.fn() }));
import { decorColumns } from "../profile/decor";
import { getDivisionBoard } from "./queries";

const rules = rankedRulesFrom((key) => SETTING_DEFAULTS[key]);

// Ancienne requête (décor lu pour chaque inscrit, dans la sous-requête du classement général) : la référence
function reference(min: number, max: number | null, grand: boolean, where: Prisma.Sql) {
  return Prisma.sql`
    SELECT * FROM (
      SELECT ranked.*, (COUNT(*) OVER ())::int AS total FROM (
        SELECT (ROW_NUMBER() OVER (ORDER BY u."rankPoints" DESC, u."createdAt" ASC))::int AS position,
               (RANK() OVER (ORDER BY u."rankPoints" DESC))::int - 1 AS ahead,
               u.id, u.username, u.image, u."rankPoints" AS pc, u."seasonGames" AS games,
               (u."profileVisibility" = 'PUBLIC') AS public, ${decorColumns}
        FROM "User" u
        WHERE u."bannedAt" IS NULL AND u."isGuest" = false
      ) ranked
      WHERE ranked.pc >= ${min} AND (${max}::int IS NULL OR ranked.pc <= ${max}::int)
        AND (ranked.pc > 0 OR ranked.games > 0)
        AND ((ranked.pc >= ${rules.grandChampion.min} AND ranked.ahead < ${rules.grandChampion.top}) = ${grand})
    ) division ${where}`;
}

describe("division du classé, sur le schéma à jour", () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const pc = 150;
  const rank = rankOf(pc, false, rules);
  const { min, max } = divisionRange(rank, rules);
  type Row = { position: number; username: string; frameStyle: string | null };
  const run = async (query: Prisma.Sql) => (await db.query<Row>(query.text, [...query.values])).rows;

  beforeAll(async () => {
    const root = resolve("prisma/migrations");
    for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
      await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
    await db.exec(`INSERT INTO "Cosmetic" (id,kind,slug,label,condition,"frameStyle","updatedAt") VALUES ('f','FRAME','cadre','{}','{}','kinpaku',now());`);
    const users: [id: string, points: number, extra: string][] = [
      ["haut", max ?? min + 50, `"frameId" = 'f'`],
      ["public", pc, ""],
      ["prive", pc + 1, `"profileVisibility" = 'PRIVATE'`],
      ["dessous", Math.max(0, min - 1), ""],
      ["banni", pc, `"bannedAt" = now()`],
      ["invite", pc, `"isGuest" = true`],
    ];
    for (const [id, points, extra] of users) {
      await db.query(`INSERT INTO "User" (id,username,"isGuest","rankPoints","seasonGames") VALUES ($1,$1,false,$2,3)`, [id, points]);
      if (extra) await db.exec(`UPDATE "User" SET ${extra} WHERE id = '${id}'`);
    }
    reader.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => run(Prisma.sql(strings, ...values)));
  }, 120_000);

  afterAll(() => db.close());

  it("liste les profils publics de la division et le joueur, avec leur décor, comme l'ancienne requête", async () => {
    const board = await getDivisionBoard("prive", { tier: rank.tier, division: rank.division, season: null }, rules);
    expect(board.entries.map((e) => [e.username, e.self])).toEqual([["haut", false], ["public", false], ["prive", true]]);
    expect(board.entries[0].decor.frame).toBe("kinpaku");
    expect(board.total).toBe(3);

    const listed = await run(reference(min, max, false, Prisma.sql`WHERE division.public ORDER BY position LIMIT 50`));
    const self = await run(reference(min, max, false, Prisma.sql`WHERE division.id = 'prive'`));
    // Le joueur, absent des premiers publics, vient après eux (comme avant)
    const expected = [...listed, ...self];
    expect(board.entries.map((e) => ({ position: e.position, username: e.username, frame: e.decor.frame }))).toEqual(
      expected.map((r) => ({ position: r.position, username: r.username, frame: r.frameStyle ?? null })),
    );
  });
});
