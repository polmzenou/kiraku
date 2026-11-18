import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Migration des avis de recherche, rejouée après toutes les autres dans un Postgres isolé en mémoire :
// les contraintes tiennent même si le code les oubliait.

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
  await pg.exec(`
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('a', 'a', '{}'), ('b', 'b', '{}');
    INSERT INTO "Series" (id, type, "titleRomaji", genres, tags) VALUES ('s', 'ANIME', 'Série', '{}', '{}');
    INSERT INTO "Card" (id, name, "imageUrl", favorites, "rarityKey", power, ki, "seriesId", "searchText", "updatedAt") VALUES
      ('k1', 'Un', 'x', 1, 'EPIC', 1, 1, 's', 'un', now());
  `);
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`DELETE FROM "BuyOrder";`);
});

async function insert(values: string) {
  await pg.exec(`INSERT INTO "BuyOrder" (id, "buyerId", "cardId", price, "feeBp", "expiresAt", status, "sellerId", "filledAt", fee) VALUES ${values}`);
}

describe("migration des avis de recherche", () => {
  it("accepte un avis ouvert et un avis rempli complet", async () => {
    await insert(`('o1', 'a', 'k1', 100, 500, now() + interval '7 days', 'OPEN', NULL, NULL, NULL)`);
    await insert(`('o2', 'a', 'k1', 100, 500, now() + interval '7 days', 'FILLED', 'b', now(), 5)`);
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "BuyOrder"`);
    expect(rows[0].n).toBe(2);
  });

  it.each([
    ["un prix nul", `('x', 'a', 'k1', 0, 500, now(), 'OPEN', NULL, NULL, NULL)`],
    ["une taxe négative", `('x', 'a', 'k1', 100, -1, now(), 'OPEN', NULL, NULL, NULL)`],
    ["un avis rempli sans date", `('x', 'a', 'k1', 100, 500, now(), 'FILLED', 'b', NULL, 5)`],
    ["un avis rempli sans taxe", `('x', 'a', 'k1', 100, 500, now(), 'FILLED', 'b', now(), NULL)`],
    ["une carte inconnue", `('x', 'a', 'nope', 100, 500, now(), 'OPEN', NULL, NULL, NULL)`],
  ])("refuse %s", async (_, values) => {
    await expect(insert(values)).rejects.toThrow();
  });

  it("efface les avis d'un compte supprimé et garde la vente quand le vendeur disparaît", async () => {
    await insert(`('o1', 'a', 'k1', 100, 500, now(), 'FILLED', 'b', now(), 5)`);
    await pg.exec(`DELETE FROM "User" WHERE id = 'b'`);
    const { rows } = await pg.query<{ sellerId: string | null }>(`SELECT "sellerId" FROM "BuyOrder" WHERE id = 'o1'`);
    expect(rows[0].sellerId).toBeNull();
    await pg.exec(`DELETE FROM "User" WHERE id = 'a'`);
    const left = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "BuyOrder"`);
    expect(left.rows[0].n).toBe(0);
  });
});
