import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Migration du pile ou face, rejouée après toutes les autres dans un Postgres isolé en mémoire.

const SEED = "ab".repeat(32);
const HASH = "cd".repeat(32);

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
  await pg.exec(`
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('a', 'a', '{}'), ('b', 'b', '{}'), ('c', 'c', '{}');
    INSERT INTO "Series" (id, type, "titleRomaji", genres, tags) VALUES ('s', 'ANIME', 'Série', '{}', '{}');
    INSERT INTO "Card" (id, name, "imageUrl", favorites, "rarityKey", power, ki, "seriesId", "searchText", "updatedAt") VALUES
      ('k1', 'Un', 'x', 1, 'MYTHIC', 1, 1, 's', 'un', now()),
      ('k2', 'Deux', 'x', 1, 'MYTHIC', 1, 1, 's', 'deux', now());
  `);
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`DELETE FROM "DiscordPost"; DELETE FROM "CoinFlip";`);
});

type Row = Record<string, string | number | boolean | null>;

const BASE: Row = {
  id: "t1",
  creatorId: "a",
  creatorUserCardId: "uc1",
  creatorCardId: "k1",
  creatorRarity: "MYTHIC",
  creatorSide: "OMOTE",
  tierOrder: 500,
  seed: SEED,
  seedHash: HASH,
  expiresAt: "2026-12-06T12:00:00Z",
};

const DONE: Row = {
  status: "DONE",
  opponentId: "b",
  opponentUserCardId: "uc2",
  opponentCardId: "k2",
  opponentRarity: "BR",
  result: "URA",
  winnerId: "b",
  resolvedAt: "2026-12-05T13:00:00Z",
};

async function insert(row: Row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO "CoinFlip" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`;
  await pg.query(sql, Object.values(row));
}

describe("migration du pile ou face (Postgres isolé en mémoire)", () => {
  it("accepte une table ouverte et une table jouée cohérentes", async () => {
    await insert(BASE);
    await insert({ ...BASE, id: "t2", creatorUserCardId: "uc9", ...DONE });
    expect((await pg.query(`SELECT id, status, "winnerNew" FROM "CoinFlip" ORDER BY id`)).rows).toEqual([
      { id: "t1", status: "OPEN", winnerNew: false },
      { id: "t2", status: "DONE", winnerNew: false },
    ]);
  });

  it("un exemplaire n'est misé que sur une table ouverte à la fois", async () => {
    await insert(BASE);
    await expect(insert({ ...BASE, id: "t2" })).rejects.toThrow();
    // Une fois la table retirée, l'exemplaire peut revenir au salon
    await pg.exec(`UPDATE "CoinFlip" SET status = 'CANCELLED', "resolvedAt" = now() WHERE id = 't1'`);
    await insert({ ...BASE, id: "t2" });
  });

  it("refuse une graine ou une empreinte mal formée", async () => {
    await expect(insert({ ...BASE, seed: "AB".repeat(32) })).rejects.toThrow();
    await expect(insert({ ...BASE, seedHash: "cd" })).rejects.toThrow();
  });

  it("on ne joue pas contre soi-même, on ne se réserve pas sa table", async () => {
    await expect(insert({ ...BASE, ...DONE, opponentId: "a", winnerId: "a", result: "OMOTE" })).rejects.toThrow();
    await expect(insert({ ...BASE, reservedForId: "a" })).rejects.toThrow();
  });

  it("une table ouverte n'a ni adversaire ni issue", async () => {
    await expect(insert({ ...BASE, opponentId: "b" })).rejects.toThrow();
    await expect(insert({ ...BASE, result: "OMOTE" })).rejects.toThrow();
    await expect(insert({ ...BASE, resolvedAt: "2026-12-05T13:00:00Z" })).rejects.toThrow();
  });

  it("une table jouée est complète", async () => {
    for (const missing of ["opponentId", "opponentUserCardId", "opponentCardId", "opponentRarity", "result", "winnerId", "resolvedAt"]) {
      await expect(insert({ ...BASE, ...DONE, [missing]: null }), missing).rejects.toThrow();
    }
  });

  it("une table retirée ou expirée est datée, sans adversaire", async () => {
    await insert({ ...BASE, status: "EXPIRED", resolvedAt: "2026-12-06T12:00:00Z" });
    await expect(insert({ ...BASE, id: "t2", creatorUserCardId: "uc8", status: "CANCELLED" })).rejects.toThrow();
    await expect(insert({ ...BASE, id: "t3", creatorUserCardId: "uc7", status: "CANCELLED", resolvedAt: "2026-12-06T12:00:00Z", opponentId: "b" })).rejects.toThrow();
  });

  it("le gagnant suit la face sortie", async () => {
    // Le créateur a 表, la pièce tombe sur 裏 : l'adversaire gagne
    await expect(insert({ ...BASE, ...DONE, winnerId: "a" })).rejects.toThrow();
    await expect(insert({ ...BASE, ...DONE, winnerId: "c" })).rejects.toThrow();
    await insert({ ...BASE, ...DONE, result: "OMOTE", winnerId: "a" });
  });

  it("supprimer le créateur ou l'adversaire supprime la table ; le joueur invité, seulement la réservation", async () => {
    await pg.exec(`INSERT INTO "User" (id, username, "battleTeam") VALUES ('x', 'x', '{}'), ('y', 'y', '{}'), ('z', 'z', '{}')`);
    await insert({ ...BASE, creatorId: "x", reservedForId: "z" });
    await insert({ ...BASE, id: "t2", creatorUserCardId: "uc5", ...DONE, opponentId: "y", winnerId: "y" });
    await pg.exec(`DELETE FROM "User" WHERE id = 'z'`);
    expect((await pg.query(`SELECT "reservedForId" FROM "CoinFlip" WHERE id = 't1'`)).rows).toEqual([{ reservedForId: null }]);
    await pg.exec(`DELETE FROM "User" WHERE id IN ('x', 'y')`);
    expect((await pg.query(`SELECT id FROM "CoinFlip"`)).rows).toEqual([]);
  });

  it("une seule annonce Discord par table, supprimée avec elle, jamais mêlée à une autre source", async () => {
    await insert({ ...BASE, ...DONE });
    await pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "coinFlipId") VALUES ('coinflip:t1', 'casino', 't1')`);
    await expect(pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "coinFlipId") VALUES ('doublon', 'casino', 't1')`)).rejects.toThrow();
    await pg.exec(`INSERT INTO "Season" (id, number, "startsAt", "endsAt") VALUES ('season-casino', 999, now(), now())`);
    await expect(pg.exec(`UPDATE "DiscordPost" SET "seasonId" = 'season-casino' WHERE key = 'coinflip:t1'`)).rejects.toThrow();
    await pg.exec(`DELETE FROM "CoinFlip" WHERE id = 't1'`);
    expect((await pg.query(`SELECT key FROM "DiscordPost"`)).rows).toEqual([]);
  });

  it("les nouvelles valeurs d'enum existent une fois la migration validée", async () => {
    await pg.exec(`INSERT INTO "UserCard" (id, "ownerId", "cardId", status) VALUES ('uc-casino', 'a', 'k1', 'CASINO')`);
    await pg.exec(`INSERT INTO "Notification" (id, "userId", type) VALUES ('n1', 'a', 'COINFLIP_RESOLVED'), ('n2', 'a', 'COINFLIP_INVITE'), ('n3', 'a', 'COINFLIP_RETURNED')`);
    expect((await pg.query(`SELECT count(*)::int AS n FROM "Notification" WHERE type::text LIKE 'COINFLIP_%'`)).rows).toEqual([{ n: 3 }]);
  });
});
