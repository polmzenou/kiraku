import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Vraie migration du mode spoiler sur le compte, sur une table User réduite : valeurs par défaut (tout flouté), plafond
// des univers en clair, et la mise à jour atomique de server/actions/spoiler.ts (ajout sans doublon, plafond, retrait).

const KEY = "cmh1jjk0000000000000univ";
let pg: PGlite;

/** Même requête que setSpoilerUniverseAction (ajout), paramètres positionnels comme Prisma. */
const show = (id: string, key: string, max = 300) =>
  pg.query(
    `UPDATE "User" SET "spoilerShown" = array_append(array_remove("spoilerShown", $1), $2)
     WHERE id = $3 AND ($4 = ANY("spoilerShown") OR cardinality("spoilerShown") < $5)`,
    [key, key, id, key, max],
  );

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY);`);
  await pg.exec(readFileSync(resolve("prisma/migrations/20261126120000_spoilers_univers/migration.sql"), "utf8"));
}, 120_000);
afterAll(async () => pg.close());

describe("migration du mode spoiler sur le compte (Postgres isolé en mémoire)", () => {
  it("floute tout par défaut, comptes existants compris", async () => {
    await pg.exec(`INSERT INTO "User" (id) VALUES ('ancien')`);
    expect((await pg.query(`SELECT "spoilerBlur", "spoilerShown" FROM "User" WHERE id = 'ancien'`)).rows).toEqual([{ spoilerBlur: true, spoilerShown: [] }]);
  });

  it("ajoute un univers une seule fois et le retire", async () => {
    await pg.exec(`INSERT INTO "User" (id) VALUES ('joueur')`);
    expect((await show("joueur", KEY)).affectedRows).toBe(1);
    expect((await show("joueur", KEY)).affectedRows).toBe(1);
    expect((await pg.query(`SELECT "spoilerShown" FROM "User" WHERE id = 'joueur'`)).rows).toEqual([{ spoilerShown: [KEY] }]);
    await pg.query(`UPDATE "User" SET "spoilerShown" = array_remove("spoilerShown", $1) WHERE id = $2`, [KEY, "joueur"]);
    expect((await pg.query(`SELECT "spoilerShown" FROM "User" WHERE id = 'joueur'`)).rows).toEqual([{ spoilerShown: [] }]);
  });

  it("refuse un univers de plus au plafond, sans toucher à la liste", async () => {
    await pg.exec(`INSERT INTO "User" (id, "spoilerShown") VALUES ('plein', ARRAY['a','b'])`);
    expect((await show("plein", KEY, 2)).affectedRows).toBe(0);
    expect((await show("plein", "a", 2)).affectedRows).toBe(1);
    expect((await pg.query(`SELECT "spoilerShown" FROM "User" WHERE id = 'plein'`)).rows).toEqual([{ spoilerShown: ["b", "a"] }]);
  });

  it("la base refuse plus de 300 univers en clair", async () => {
    await expect(pg.exec(`INSERT INTO "User" (id, "spoilerShown") VALUES ('trop', array_fill('k'::text, ARRAY[301]))`)).rejects.toThrow(/User_spoilerShown_check/);
    await pg.exec(`INSERT INTO "User" (id, "spoilerShown") VALUES ('limite', array_fill('k'::text, ARRAY[300]))`);
  });
});
