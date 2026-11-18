import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Migrations du prestige, rejouées après toutes les autres dans un Postgres isolé en mémoire.

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
  await pg.exec(`
    INSERT INTO "Series" (id, type, "titleRomaji", genres, tags) VALUES ('s', 'ANIME', 'Série', '{}', '{}');
    INSERT INTO "Card" (id, name, "imageUrl", favorites, "rarityKey", power, ki, "seriesId", "searchText", "updatedAt") VALUES
      ('k1', 'Un', 'x', 1, 'MYTHIC', 1, 1, 's', 'un', now()),
      ('k2', 'Deux', 'x', 1, 'MYTHIC', 1, 1, 's', 'deux', now());
  `);
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`
    DELETE FROM "UserCard";
    DELETE FROM "User";
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('a', 'a', '{}'), ('b', 'b', '{}');
  `);
});

const copy = (id: string, extra = "", values = "") =>
  pg.exec(`INSERT INTO "UserCard" (id, "ownerId", "cardId"${extra}) VALUES ('${id}', 'a', 'k1'${values})`);
const one = async <T>(sql: string) => (await pg.query<T>(sql)).rows[0];

describe("migration prestige_copies", () => {
  it("un exemplaire naît ordinaire", async () => {
    await copy("u1");
    expect(await one(`SELECT heritage, "keptByOwner", printing, serial FROM "UserCard" WHERE id = 'u1'`)).toEqual({
      heritage: 0,
      keptByOwner: 0,
      printing: null,
      serial: null,
    });
  });

  it("borne l'héritage et le compteur du propriétaire", async () => {
    await expect(copy("h6", `, heritage`, `, 6`)).rejects.toThrow(/UserCard_heritage_check/);
    await expect(copy("hn", `, heritage`, `, -1`)).rejects.toThrow(/UserCard_heritage_check/);
    // « Gardée par son propriétaire » n'a de sens que pour une héritière
    await expect(copy("k0", `, "keptByOwner"`, `, 1`)).rejects.toThrow(/UserCard_heritage_check/);
    await copy("ok", `, heritage, "keptByOwner"`, `, 5, 3`);
  });

  it("tirage et numéro vont ensemble, à partir de 1", async () => {
    await expect(copy("p1", `, printing`, `, 1`)).rejects.toThrow(/UserCard_engraving_check/);
    await expect(copy("s1", `, serial`, `, 4`)).rejects.toThrow(/UserCard_engraving_check/);
    await expect(copy("z0", `, printing, serial`, `, 1, 0`)).rejects.toThrow(/UserCard_engraving_check/);
    await expect(copy("z1", `, printing, serial`, `, 0, 1`)).rejects.toThrow(/UserCard_engraving_check/);
    await copy("ok", `, printing, serial`, `, 1, 4`);
  });

  it("un numéro n'existe qu'une fois par carte et par tirage", async () => {
    // Les exemplaires ordinaires d'une même carte ne se gênent pas
    await copy("o1");
    await copy("o2");
    await copy("e1", `, printing, serial`, `, 1, 12`);
    await expect(copy("e2", `, printing, serial`, `, 1, 12`)).rejects.toThrow(/UserCard_engraved_key/);
    // Même numéro dans un autre tirage, ou sur une autre carte : permis
    await copy("e3", `, printing, serial`, `, 2, 12`);
    await pg.exec(`INSERT INTO "UserCard" (id, "ownerId", "cardId", printing, serial) VALUES ('e4', 'a', 'k2', 1, 12)`);
  });

  it("remet « gardée par son propriétaire » à zéro quand le propriétaire change", async () => {
    await copy("h", `, heritage, "keptByOwner"`, `, 3, 2`);
    // Un changement de statut seul ne touche à rien
    await pg.exec(`UPDATE "UserCard" SET status = 'AUCTION' WHERE id = 'h'`);
    expect(await one(`SELECT "keptByOwner" FROM "UserCard" WHERE id = 'h'`)).toEqual({ keptByOwner: 2 });
    // Même si l'écriture tente de garder le compteur, le déclencheur l'efface
    await pg.exec(`UPDATE "UserCard" SET "ownerId" = 'b', "keptByOwner" = 2 WHERE id = 'h'`);
    expect(await one(`SELECT heritage, "keptByOwner", "ownerId" FROM "UserCard" WHERE id = 'h'`)).toEqual({ heritage: 3, keptByOwner: 0, ownerId: "b" });
  });

  it("la provenance suit l'exemplaire et survit au compte", async () => {
    await copy("e", `, printing, serial`, `, 1, 7`);
    await pg.exec(`
      INSERT INTO "UserCardOwner" (id, "userCardId", "ownerId", via) VALUES ('p1', 'e', 'a', 'DRAW'), ('p2', 'e', 'b', 'CASINO');
    `);
    // Compte supprimé : la ligne reste, sans propriétaire
    await pg.exec(`UPDATE "UserCard" SET "ownerId" = 'b' WHERE id = 'e'; DELETE FROM "User" WHERE id = 'a';`);
    expect((await pg.query(`SELECT id, "ownerId" FROM "UserCardOwner" ORDER BY id`)).rows).toEqual([
      { id: "p1", ownerId: null },
      { id: "p2", ownerId: "b" },
    ]);
    // Exemplaire recyclé : sa provenance part avec lui
    await pg.exec(`DELETE FROM "UserCard" WHERE id = 'e'`);
    expect(await one(`SELECT count(*)::int AS n FROM "UserCardOwner"`)).toEqual({ n: 0 });
    await expect(pg.exec(`INSERT INTO "UserCardOwner" (id, "userCardId", via) VALUES ('p3', 'absent', 'GIFT')`)).rejects.toThrow(/UserCardOwner_userCardId_fkey/);
  });

  it("un échange en attente peut désigner un exemplaire, sans clé étrangère", async () => {
    const rows = (
      await pg.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.columns WHERE column_name = 'userCardId' AND table_name IN ('TradeListing', 'ListingOffer', 'TradeOffer', 'Trade') ORDER BY table_name`,
      )
    ).rows.map((r) => r.table_name);
    expect(rows).toEqual(["ListingOffer", "Trade", "TradeListing", "TradeOffer"]);
    const fks = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.key_column_usage k JOIN information_schema.table_constraints c USING (constraint_name)
       WHERE c.constraint_type = 'FOREIGN KEY' AND k.column_name = 'userCardId' AND k.table_name IN ('TradeListing', 'ListingOffer', 'TradeOffer', 'Trade')`,
    );
    expect(fks).toEqual({ n: 0 });
  });
});
