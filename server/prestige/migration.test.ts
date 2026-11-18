import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { moveCopy } from "../collection/transfer";

// Migrations du prestige, rejouées après toutes les autres dans un Postgres isolé en mémoire, et moveCopy sur cette
// base : écriture conditionnelle, remise à zéro de « gardée par son propriétaire », provenance des seuls spéciaux.

let pg: PGlite;
const NOW = new Date("2026-11-18T12:00:00.000Z");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

// Le template balisé de Prisma devient une requête paramétrée PGlite ($1, $2…) ; la provenance, un INSERT
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((sql, part, i) => sql + part + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values.map(iso))).rows;
  },
  userCardOwner: {
    create: async ({ data }: { data: { userCardId: string; ownerId: string; via: string; at: Date } }) =>
      pg.query(`INSERT INTO "UserCardOwner" (id, "userCardId", "ownerId", via, at) VALUES ($1, $2, $3, $4::"OwnershipVia", $5)`, [
        randomUUID(),
        data.userCardId,
        data.ownerId,
        data.via,
        iso(data.at),
      ]),
  },
} as unknown as Prisma.TransactionClient;


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

describe("migration prestige_cycles", () => {
  it("un prestige ne descend pas sous zéro et va avec sa date", async () => {
    await expect(pg.exec(`UPDATE "User" SET prestige = 1 WHERE id = 'a'`)).rejects.toThrow(/User_prestige_check/);
    await expect(pg.exec(`UPDATE "User" SET "prestigedAt" = now() WHERE id = 'a'`)).rejects.toThrow(/User_prestige_check/);
    await expect(pg.exec(`UPDATE "User" SET prestige = -1, "prestigedAt" = now() WHERE id = 'a'`)).rejects.toThrow(/User_prestige_check/);
    await pg.exec(`UPDATE "User" SET prestige = 1, "prestigedAt" = now() WHERE id = 'a'`);
  });

  it("une renaissance par prestige, un rang global par renaissance, effacées avec le compte", async () => {
    const cycle = (id: string, user: string, n: number, rank: number) =>
      pg.exec(`INSERT INTO "PrestigeCycle" (id, "userId", number, "globalRank", "uniqueCards", zeni, heirs, stats) VALUES ('${id}', '${user}', ${n}, ${rank}, 10, 5, '[]', '{}')`);
    await cycle("c1", "a", 1, 1);
    await expect(cycle("c2", "a", 1, 2)).rejects.toThrow(/PrestigeCycle_userId_number_key/);
    await expect(cycle("c3", "b", 1, 1)).rejects.toThrow(/PrestigeCycle_globalRank_key/);
    await expect(cycle("c4", "b", 0, 3)).rejects.toThrow(/PrestigeCycle_bounds/);
    await cycle("c5", "b", 1, 2);
    await pg.exec(`DELETE FROM "User" WHERE id = 'a'`);
    expect((await pg.query(`SELECT id FROM "PrestigeCycle"`)).rows).toEqual([{ id: "c5" }]);
  });

  it("une découverte peut être retrouvée dans le cycle en cours", async () => {
    await pg.exec(`INSERT INTO "Discovery" ("userId", "cardId", "regainedAt") VALUES ('a', 'k1', now())`);
    expect(await one(`SELECT ("regainedAt" IS NOT NULL) AS regained FROM "Discovery" WHERE "userId" = 'a'`)).toEqual({ regained: true });
  });

  it("les Zeni d'une renaissance ont leur motif au grand livre", async () => {
    const reasons = (await pg.query<{ v: string }>(`SELECT unnest(enum_range(NULL::"CoinReason"))::text AS v`)).rows.map((r) => r.v);
    expect(reasons).toContain("REBIRTH");
  });
});


const row = async (id: string) =>
  (await pg.query<{ ownerId: string; status: string; keptByOwner: number }>(
    `SELECT "ownerId", status::text AS status, "keptByOwner" FROM "UserCard" WHERE id = $1`,
    [id],
  )).rows[0];
const provenance = async () => (await pg.query(`SELECT "userCardId", "ownerId", via::text AS via FROM "UserCardOwner" ORDER BY "userCardId"`)).rows;

describe("moveCopy (server/collection/transfer.ts)", () => {
  beforeEach(async () => {
    await pg.exec(`
      DELETE FROM "UserCard";
      INSERT INTO "UserCard" (id, "ownerId", "cardId", status) VALUES ('plain', 'a', 'k1', 'COLLECTION'), ('sold', 'a', 'k1', 'AUCTION');
      INSERT INTO "UserCard" (id, "ownerId", "cardId", heritage, "keptByOwner") VALUES ('heir', 'a', 'k1', 2, 1);
      INSERT INTO "UserCard" (id, "ownerId", "cardId", printing, serial, status) VALUES ('engraved', 'a', 'k1', 1, 7, 'CASINO');
    `);
  });

  it("donne un exemplaire ordinaire, sans écrire de provenance", async () => {
    expect(await moveCopy(tx, { userCardId: "plain", fromId: "a", fromStatus: "COLLECTION", toId: "b", via: "GIFT", now: NOW })).toBe(true);
    expect(await row("plain")).toMatchObject({ ownerId: "b", status: "COLLECTION" });
    // Lu en texte : PGlite relit un timestamp sans fuseau dans l'heure locale de la machine
    expect((await pg.query(`SELECT "obtainedAt"::text AS t FROM "UserCard" WHERE id = 'plain'`)).rows[0]).toEqual({ t: "2026-11-18 12:00:00" });
    expect(await provenance()).toEqual([]);
  });

  it("une héritière garde son héritage, repart de zéro chez son nouveau propriétaire, et sa provenance est écrite", async () => {
    expect(await moveCopy(tx, { userCardId: "heir", fromId: "a", fromStatus: "COLLECTION", toId: "b", via: "TRADE", now: NOW })).toBe(true);
    expect(await row("heir")).toMatchObject({ ownerId: "b", keptByOwner: 0 });
    expect((await pg.query(`SELECT heritage FROM "UserCard" WHERE id = 'heir'`)).rows[0]).toEqual({ heritage: 2 });
    expect(await provenance()).toEqual([{ userCardId: "heir", ownerId: "b", via: "TRADE" }]);
  });

  it("sort une vente conclue ou une mise perdue de leur statut, vers la collection du gagnant", async () => {
    expect(await moveCopy(tx, { userCardId: "sold", fromId: "a", fromStatus: "AUCTION", toId: "b", via: "AUCTION", now: NOW })).toBe(true);
    expect(await row("sold")).toMatchObject({ ownerId: "b", status: "COLLECTION" });
    expect(await moveCopy(tx, { userCardId: "engraved", fromId: "a", fromStatus: "CASINO", toId: "b", via: "CASINO", now: NOW })).toBe(true);
    expect(await row("engraved")).toMatchObject({ ownerId: "b", status: "COLLECTION" });
    expect(await provenance()).toEqual([{ userCardId: "engraved", ownerId: "b", via: "CASINO" }]);
  });

  it("ne touche à rien si l'exemplaire n'est plus là où on l'attend", async () => {
    // Mauvais statut (la carte est misée au casino), mauvais propriétaire, exemplaire inconnu
    expect(await moveCopy(tx, { userCardId: "engraved", fromId: "a", fromStatus: "COLLECTION", toId: "b", via: "GIFT", now: NOW })).toBe(false);
    expect(await moveCopy(tx, { userCardId: "plain", fromId: "b", fromStatus: "COLLECTION", toId: "a", via: "GIFT", now: NOW })).toBe(false);
    expect(await moveCopy(tx, { userCardId: "absent", fromId: "a", fromStatus: "COLLECTION", toId: "b", via: "GIFT", now: NOW })).toBe(false);
    expect(await row("engraved")).toMatchObject({ ownerId: "a", status: "CASINO" });
    expect(await row("plain")).toMatchObject({ ownerId: "a" });
    expect(await provenance()).toEqual([]);
  });
});
