import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { seededRng } from "@/lib/rng";
import { moveCopy } from "../collection/transfer";
import { consecrateWith, ConsecrateError } from "./consecrate-core";
import { takeSerial } from "./printing-core";

// Migrations du prestige, rejouées après toutes les autres dans un Postgres isolé en mémoire, puis moveCopy et la
// requête du numéro d'une gravée sur cette base : écriture conditionnelle, remise à zéro de « gardée par son
// propriétaire », provenance des seuls spéciaux, numéros d'un tirage tous distincts.

let pg: PGlite;
const NOW = new Date("2026-11-18T12:00:00.000Z");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

// Le template balisé de Prisma devient une requête paramétrée PGlite ($1, $2…) ; la provenance, un INSERT
const sql = (strings: TemplateStringsArray, values: unknown[]) => strings.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), "");
const tx = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await pg.query(sql(strings, values), values.map(iso))).rows,
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await pg.query(sql(strings, values), values.map(iso))).affectedRows ?? 0,
  userCardOwner: {
    create: async ({ data }: { data: { userCardId: string; ownerId: string; via: string; at: Date } }) =>
      pg.query(`INSERT INTO "UserCardOwner" (id, "userCardId", "ownerId", via, at) VALUES ($1, $2, $3, $4::"OwnershipVia", $5)`, [
        randomUUID(),
        data.userCardId,
        data.ownerId,
        data.via,
        iso(data.at),
      ]),
    findMany: async ({ where }: { where: { userCardId: string } }) =>
      (await pg.query<{ ownerId: string | null; via: string; at: Date }>(`SELECT "ownerId", via::text AS via, at FROM "UserCardOwner" WHERE "userCardId" = $1 ORDER BY at, id`, [where.userCardId])).rows,
  },
} as unknown as Prisma.TransactionClient;
// Client injecté pour les cœurs qui ouvrent leur transaction : PGlite n'a qu'une connexion, le rappel suffit
const db = { $transaction: async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;


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
      ('k2', 'Deux', 'x', 1, 'MYTHIC', 1, 1, 's', 'deux', now()),
      ('k3', 'Trois', 'x', 1, 'MYTHIC', 1, 1, 's', 'trois', now());
    -- Une gravée renvoie au compteur de son tirage (clé étrangère du lot 16c)
    INSERT INTO "CardPrinting" ("cardId", printing, size) VALUES ('k1', 1, 100), ('k1', 2, 100), ('k2', 1, 100);
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


describe("migration prestige_printings", () => {
  beforeEach(async () => {
    await pg.exec(`DELETE FROM "NotablePull"; DELETE FROM "CardPrinting" WHERE "cardId" = 'k3';`);
  });
  const take = (size: number, seed: number, printing = 1) => takeSerial(tx, { cardId: "k3", printing, size, rng: seededRng(seed) });

  it("un tirage de taille n rend exactement les numéros 1 à n, dans le désordre, puis plus rien", async () => {
    const serials: number[] = [];
    for (let i = 0; i < 5; i++) {
      const edition = await take(5, 11 + i);
      expect(edition).toMatchObject({ printing: 1, size: 5 });
      serials.push(edition!.serial);
    }
    expect([...serials].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(serials).not.toEqual([1, 2, 3, 4, 5]);
    // Tirage épuisé : la carte sortira ordinaire
    expect(await take(5, 99)).toBeNull();
    expect(await one(`SELECT issued, taken FROM "CardPrinting" WHERE "cardId" = 'k3'`)).toEqual({ issued: 5, taken: serials });
  });

  it("la taille d'un tirage est figée à sa création ; un autre tirage repart de zéro", async () => {
    expect(await take(3, 1)).toMatchObject({ size: 3 });
    expect(await take(9, 2)).toMatchObject({ size: 3 });
    expect(await take(9, 3, 2)).toMatchObject({ printing: 2, size: 9 });
    expect(await one(`SELECT count(*)::int AS n FROM "CardPrinting" WHERE "cardId" = 'k3'`)).toEqual({ n: 2 });
  });

  it("un tirage ne revient jamais en arrière", async () => {
    await take(4, 5);
    await take(4, 6);
    const back = [
      `UPDATE "CardPrinting" SET issued = issued - 1, taken = taken[1:1] WHERE "cardId" = 'k3'`,
      `UPDATE "CardPrinting" SET taken = ARRAY[taken[2], taken[1]] WHERE "cardId" = 'k3'`,
      `UPDATE "CardPrinting" SET size = 10 WHERE "cardId" = 'k3'`,
    ];
    for (const statement of back) await expect(pg.exec(statement)).rejects.toThrow(/en arrière/);
    // Un numéro déjà sorti, hors du tirage ou nul ne peut pas être ajouté
    const bad = (n: string) => pg.exec(`UPDATE "CardPrinting" SET issued = issued + 1, taken = array_append(taken, ${n}) WHERE "cardId" = 'k3'`);
    const [first] = (await pg.query<{ taken: number[] }>(`SELECT taken FROM "CardPrinting" WHERE "cardId" = 'k3'`)).rows[0].taken;
    await expect(bad(String(first))).rejects.toThrow(/hors du tirage ou en double/);
    await expect(bad("5")).rejects.toThrow(/hors du tirage ou en double/);
    await expect(bad("0")).rejects.toThrow(/hors du tirage ou en double/);
    await expect(bad("NULL")).rejects.toThrow(/hors du tirage ou en double/);
    // Compteur et numéros sortis vont ensemble
    await expect(pg.exec(`UPDATE "CardPrinting" SET issued = issued + 1 WHERE "cardId" = 'k3'`)).rejects.toThrow(/CardPrinting_bounds/);
    await expect(pg.exec(`INSERT INTO "CardPrinting" ("cardId", printing, size) VALUES ('k3', 0, 5)`)).rejects.toThrow(/CardPrinting_bounds/);
  });

  it("une gravée renvoie au compteur de son tirage ; un exemplaire ordinaire n'en a pas besoin", async () => {
    await expect(pg.exec(`INSERT INTO "UserCard" (id, "ownerId", "cardId", printing, serial) VALUES ('orphan', 'a', 'k3', 1, 1)`)).rejects.toThrow(
      /UserCard_cardId_printing_fkey/,
    );
    const edition = await take(5, 7);
    await pg.exec(`INSERT INTO "UserCard" (id, "ownerId", "cardId", printing, serial) VALUES ('g', 'a', 'k3', 1, ${edition!.serial}), ('o', 'a', 'k3', NULL, NULL)`);
    // Le compteur ne part pas tant qu'une gravée y renvoie
    await expect(pg.exec(`DELETE FROM "CardPrinting" WHERE "cardId" = 'k3'`)).rejects.toThrow(/UserCard_cardId_printing_fkey/);
    await pg.exec(`DELETE FROM "UserCard" WHERE id IN ('g', 'o')`);
  });

  it("le carrousel et le lien de partage gardent l'édition tirée", async () => {
    const pull = (values: string) =>
      pg.exec(`INSERT INTO "NotablePull" (id, "userId", "cardId", "rarityKey", "boosterSlug", printing, serial, "printingSize") VALUES (${values})`);
    await pull(`'n1', 'a', 'k3', 'MYTHIC', 'b', 1, 17, 25`);
    await pull(`'n2', 'a', 'k3', 'MYTHIC', 'b', NULL, NULL, NULL`);
    await expect(pull(`'n3', 'a', 'k3', 'MYTHIC', 'b', 1, NULL, 25`)).rejects.toThrow(/NotablePull_engraving_check/);
    await expect(pull(`'n4', 'a', 'k3', 'MYTHIC', 'b', 1, 26, 25`)).rejects.toThrow(/NotablePull_engraving_check/);
    await pg.exec(`INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds", editions) VALUES ('o1', 'a', 'b', '{}', '{}', '[{"position": 2, "printing": 1, "serial": 17, "size": 25}]')`);
    expect(await one(`SELECT editions FROM "BoosterOpening" WHERE id = 'o1'`)).toEqual({ editions: [{ position: 2, printing: 1, serial: 17, size: 25 }] });
  });
});


describe("migration prestige_sanctuary et consécration", () => {
  const rules = { heritageMax: 5, consecrateMinOwnCycles: 1 };
  const consecrate = (userCardId: string, userId = "a") => consecrateWith(db, { userId, userCardId, now: NOW }, rules);
  const refused = async (run: Promise<unknown>) => {
    try {
      await run;
      return null;
    } catch (e) {
      if (e instanceof ConsecrateError) return e.code;
      throw e;
    }
  };

  beforeEach(async () => {
    await pg.exec(`
      UPDATE "User" SET prestige = 5, "prestigedAt" = now(), "isGuest" = false WHERE id = 'a';
      INSERT INTO "UserCard" (id, "ownerId", "cardId", heritage, "keptByOwner") VALUES ('relic', 'a', 'k1', 5, 1);
      INSERT INTO "UserCardOwner" (id, "userCardId", "ownerId", via, at) VALUES
        ('o1', 'relic', 'b', 'DRAW', '2026-11-01 10:00'), ('o2', 'relic', 'a', 'TRADE', '2026-11-02 10:00');
      INSERT INTO "PrestigeCycle" (id, "userId", number, "globalRank", "uniqueCards", zeni, heirs, stats) VALUES
        ('cy4', 'a', 4, 40, 10, 5, '[{"userCardId": "relic", "cardId": "k1", "heritage": 4}]', '{}'),
        ('cy5', 'a', 5, 50, 10, 5, '[{"userCardId": "relic", "cardId": "k1", "heritage": 5}]', '{}'),
        ('cy3', 'a', 3, 30, 10, 5, '[{"userCardId": "autre", "cardId": "k2", "heritage": 1}]', '{}');
    `);
  });

  it("l'héritière quitte la collection pour le sanctuaire, avec son parcours", async () => {
    expect(await consecrate("relic")).toEqual({ id: "relic", cardId: "k1" });
    expect(await one(`SELECT count(*)::int AS n FROM "UserCard" WHERE id = 'relic'`)).toEqual({ n: 0 });
    const relic = await one<{ heritage: number; printing: number | null; journey: { owners: { ownerId: string; via: string }[]; cycles: number[]; prestige: number } }>(
      `SELECT heritage, printing, journey FROM "ConsecratedCard" WHERE id = 'relic' AND "userId" = 'a'`,
    );
    expect(relic.heritage).toBe(5);
    expect(relic.printing).toBeNull();
    expect(relic.journey.owners.map((o) => [o.ownerId, o.via])).toEqual([
      ["b", "DRAW"],
      ["a", "TRADE"],
    ]);
    expect(relic.journey.cycles).toEqual([4, 5]);
    expect(relic.journey.prestige).toBe(5);
    // La provenance vivante est partie avec l'exemplaire ; le parcours est figé dans le sanctuaire
    expect(await one(`SELECT count(*)::int AS n FROM "UserCardOwner"`)).toEqual({ n: 0 });
  });

  it("refuse sans rien toucher : pas au plafond, pas gardée par le joueur, en jeu ailleurs ou à un autre", async () => {
    await pg.exec(`
      INSERT INTO "UserCard" (id, "ownerId", "cardId", heritage, "keptByOwner", status) VALUES
        ('h4', 'a', 'k1', 4, 1, 'COLLECTION'), ('bought', 'a', 'k1', 5, 0, 'COLLECTION'), ('sold', 'a', 'k1', 5, 1, 'AUCTION'), ('theirs', 'b', 'k1', 5, 1, 'COLLECTION');
    `);
    for (const id of ["h4", "bought", "sold", "theirs", "absent"]) expect(await refused(consecrate(id)), id).toBe("NOT_ELIGIBLE");
    expect(await one(`SELECT count(*)::int AS n FROM "ConsecratedCard"`)).toEqual({ n: 0 });
    expect(await one(`SELECT count(*)::int AS n FROM "UserCard"`)).toEqual({ n: 5 });
  });

  it("un compte invité, banni ou gelé ne consacre rien", async () => {
    await pg.exec(`UPDATE "User" SET "isGuest" = true WHERE id = 'a'`);
    expect(await refused(consecrate("relic"))).toBe("GUEST");
    await pg.exec(`UPDATE "User" SET "isGuest" = false, "bannedAt" = now() WHERE id = 'a'`);
    expect(await refused(consecrate("relic"))).toBe("BANNED");
    await pg.exec(`UPDATE "User" SET "bannedAt" = NULL, "deletionRequestedAt" = now() WHERE id = 'a'`);
    expect(await refused(consecrate("relic"))).toBe("FROZEN");
    expect(await one(`SELECT count(*)::int AS n FROM "UserCard" WHERE id = 'relic'`)).toEqual({ n: 1 });
  });

  it("une gravée consacrée garde son numéro pour toujours ; la carte ne quitte plus le catalogue", async () => {
    const insert = (id: string, extra: string) =>
      pg.exec(`INSERT INTO "ConsecratedCard" (id, "userId", "cardId", heritage, printing, serial, size, journey) VALUES ('${id}', 'a', 'k2', ${extra}, '{}')`);
    await expect(insert("z", "0, NULL, NULL, NULL")).rejects.toThrow(/ConsecratedCard_check/);
    await expect(insert("p", "5, 1, NULL, 25")).rejects.toThrow(/ConsecratedCard_check/);
    await insert("g1", "5, 1, 17, 25");
    await expect(insert("g2", "5, 1, 17, 25")).rejects.toThrow(/ConsecratedCard_engraved_key/);
    await expect(pg.exec(`DELETE FROM "Card" WHERE id = 'k2'`)).rejects.toThrow(/ConsecratedCard_cardId_fkey/);
    // Compte supprimé : son sanctuaire part avec lui
    await pg.exec(`DELETE FROM "UserCard" WHERE "ownerId" = 'a'; DELETE FROM "User" WHERE id = 'a'`);
    expect(await one(`SELECT count(*)::int AS n FROM "ConsecratedCard"`)).toEqual({ n: 0 });
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
