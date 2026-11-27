import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const reader = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock("../db", () => ({ prisma: { $queryRaw: reader.query } }));
import { getTopCollectors } from "./leaderboard";

// Classement des collectionneurs, sur le schéma à jour : la requête par joueur (LATERAL) rend exactement ce que
// rendait l'ancien COUNT(DISTINCT) groupé sur toute la table, gardé ici comme référence.
const REFERENCE = (raw: boolean) => `
  SELECT u."username",
    GREATEST(COUNT(DISTINCT uc."cardId") - ${raw ? "0" : `u."leaderboardMalus"`}, 0)::int AS "uniqueCards",
    GREATEST(COUNT(DISTINCT uc."cardId") FILTER (WHERE c."rarityKey" = 'MYTHIC') - ${raw ? "0" : `u."leaderboardMythicMalus"`}, 0)::int AS "mythics"
  FROM "User" u
  LEFT JOIN "UserCard" uc ON uc."ownerId" = u."id"
  LEFT JOIN "Card" c ON c."id" = uc."cardId"
  WHERE u."bannedAt" IS NULL AND u."leaderboardHiddenAt" IS NULL AND u."profileVisibility" = 'PUBLIC'
  GROUP BY u."id"
  HAVING COUNT(uc."id") > 0 OR u."prestige" > 0
  ORDER BY u."prestige" DESC, "uniqueCards" DESC, "mythics" DESC, u."createdAt" ASC
  LIMIT 50`;

describe("classement des collectionneurs", () => {
  const db = new PGlite({ extensions: { pg_trgm } });

  beforeAll(async () => {
    const root = resolve("prisma/migrations");
    for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
      await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
    await db.exec(`INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('s','CUSTOM','Univers','{}','{}');`);
    const cards: [string, string][] = [["c1", "COMMON"], ["c2", "COMMON"], ["l1", "LEGENDARY"], ["m1", "MYTHIC"], ["m2", "MYTHIC"], ["m3", "MYTHIC"]];
    for (const [id, rarity] of cards) {
      await db.query(
        `INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status)
         VALUES ($1,$1,'',0,$2,10,10,'s',$1,now(),'CUSTOM','PUBLISHED')`,
        [id, rarity],
      );
    }
    // Un cadre actif pour le décor du premier
    await db.exec(`INSERT INTO "Cosmetic" (id,kind,slug,label,condition,"frameStyle","updatedAt") VALUES ('f','FRAME','cadre','{}','{}','kinpaku',now());`);
    const users: { id: string; extra?: string; at: string }[] = [
      { id: "alice", at: "2026-10-01", extra: `"frameId" = 'f'` },
      { id: "bob", at: "2026-10-02", extra: `"leaderboardMalus" = 1, "leaderboardMythicMalus" = 1` },
      { id: "chloe", at: "2026-10-03", extra: `"profileVisibility" = 'PRIVATE'` },
      { id: "dan", at: "2026-10-04", extra: `"bannedAt" = now()` },
      { id: "eve", at: "2026-10-05", extra: `prestige = 2, "prestigedAt" = now()` },
      { id: "fred", at: "2026-10-06" },
      { id: "gina", at: "2026-10-07", extra: `"leaderboardHiddenAt" = now()` },
      // Même total que bob sans malus : départagé par l'ancienneté
      { id: "hugo", at: "2026-10-08" },
    ];
    for (const u of users) {
      await db.query(`INSERT INTO "User" (id,username,"createdAt") VALUES ($1,$1,$2)`, [u.id, u.at]);
      if (u.extra) await db.exec(`UPDATE "User" SET ${u.extra} WHERE id = '${u.id}'`);
    }
    const copies: [string, string[]][] = [
      ["alice", ["c1", "c1", "c2", "m1", "m1", "m2"]],
      ["bob", ["c1", "m3", "m3"]],
      ["chloe", ["c1", "c2", "l1", "m1", "m2", "m3"]],
      ["dan", ["m1", "m2", "m3"]],
      ["gina", ["m1"]],
      ["hugo", ["c2", "l1"]],
    ];
    let n = 0;
    for (const [owner, ids] of copies) {
      for (const cardId of ids) await db.query(`INSERT INTO "UserCard" (id,"ownerId","cardId") VALUES ($1,$2,$3)`, [`copy-${n++}`, owner, cardId]);
    }
    reader.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values);
      return (await db.query(query.text, [...query.values])).rows;
    });
  }, 120_000);

  afterAll(() => db.close());

  it("prestige d'abord, puis cartes distinctes et Mythiques distinctes, malus de l'admin déduits", async () => {
    const top = await getTopCollectors();
    expect(top.map(({ username, uniqueCards, mythics, rank }) => ({ username, uniqueCards, mythics, rank }))).toEqual([
      { username: "eve", uniqueCards: 0, mythics: 0, rank: 1 },
      { username: "alice", uniqueCards: 4, mythics: 2, rank: 2 },
      { username: "hugo", uniqueCards: 2, mythics: 0, rank: 3 },
      { username: "bob", uniqueCards: 1, mythics: 0, rank: 4 },
    ]);
    expect(top[1].decor.frame).toBe("kinpaku");
  });

  it("rend les mêmes lignes que l'ancienne requête groupée, avec et sans malus", async () => {
    for (const raw of [false, true]) {
      const expected = (await db.query<{ username: string; uniqueCards: number; mythics: number }>(REFERENCE(raw))).rows;
      const top = await getTopCollectors(50, { raw });
      expect(top.map(({ username, uniqueCards, mythics }) => ({ username, uniqueCards, mythics }))).toEqual(expected);
    }
    // Sans malus (rôle DEV) : bob compte ses deux cartes et sa Mythique, et passe devant hugo, plus récent
    expect((await getTopCollectors(50, { raw: true })).map((c) => c.username)).toEqual(["eve", "alice", "bob", "hugo"]);
  });
});
