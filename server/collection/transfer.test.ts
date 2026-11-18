import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { moveCopy } from "./transfer";

// moveCopy sur un Postgres isolé en mémoire, toutes migrations rejouées : écriture conditionnelle, remise à zéro
// de « gardée par son propriétaire », provenance des seuls exemplaires spéciaux.

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
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('a', 'a', '{}'), ('b', 'b', '{}');
    INSERT INTO "Series" (id, type, "titleRomaji", genres, tags) VALUES ('s', 'ANIME', 'Série', '{}', '{}');
    INSERT INTO "Card" (id, name, "imageUrl", favorites, "rarityKey", power, ki, "seriesId", "searchText", "updatedAt") VALUES
      ('k', 'Une', 'x', 1, 'MYTHIC', 1, 1, 's', 'une', now());
  `);
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`
    DELETE FROM "UserCard";
    INSERT INTO "UserCard" (id, "ownerId", "cardId", status) VALUES ('plain', 'a', 'k', 'COLLECTION'), ('sold', 'a', 'k', 'AUCTION');
    INSERT INTO "UserCard" (id, "ownerId", "cardId", heritage, "keptByOwner") VALUES ('heir', 'a', 'k', 2, 1);
    INSERT INTO "UserCard" (id, "ownerId", "cardId", printing, serial, status) VALUES ('engraved', 'a', 'k', 1, 7, 'CASINO');
  `);
});

const row = async (id: string) =>
  (await pg.query<{ ownerId: string; status: string; keptByOwner: number }>(
    `SELECT "ownerId", status::text AS status, "keptByOwner" FROM "UserCard" WHERE id = $1`,
    [id],
  )).rows[0];
const provenance = async () => (await pg.query(`SELECT "userCardId", "ownerId", via::text AS via FROM "UserCardOwner" ORDER BY "userCardId"`)).rows;

describe("moveCopy", () => {
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
