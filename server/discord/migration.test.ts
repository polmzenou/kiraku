import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('CREATE TABLE "Auction" (id TEXT PRIMARY KEY);');
  await pg.exec(readFileSync(resolve("prisma/migrations/20261030120000_discord_community/migration.sql"), "utf8"));
  await pg.exec('CREATE TABLE "TradeListing" (id TEXT PRIMARY KEY);');
  await pg.exec(readFileSync(resolve("prisma/migrations/20261030130000_discord_trade_listings/migration.sql"), "utf8"));
  await pg.exec('CREATE TABLE "Season" (id TEXT PRIMARY KEY);');
  await pg.exec(readFileSync(resolve("prisma/migrations/20261030140000_discord_roles_ranked/migration.sql"), "utf8"));
}, 30_000);
afterAll(async () => pg.close());

describe("migration Discord (Postgres isolé en mémoire)", () => {
  it("garantit une publication par vente et supprime la file avec la vente", async () => {
    await pg.exec(`INSERT INTO "Auction" VALUES ('a1');
      INSERT INTO "DiscordPost" (key, "channelId", "auctionId") VALUES ('auction:a1', 'channel', 'a1');`);
    await expect(pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "auctionId") VALUES ('duplicate', 'channel', 'a1')`)).rejects.toThrow();
    await pg.exec(`DELETE FROM "Auction" WHERE id='a1'`);
    expect((await pg.query('SELECT key FROM "DiscordPost"')).rows).toEqual([]);
  });
  it("annule ensemble la vente et son annonce dans une transaction abandonnée", async () => {
    await pg.exec(`BEGIN; INSERT INTO "Auction" VALUES ('a2');
      INSERT INTO "DiscordPost" (key, "channelId", "auctionId") VALUES ('auction:a2', 'channel', 'a2'); ROLLBACK;`);
    expect((await pg.query('SELECT id FROM "Auction"')).rows).toEqual([]);
    expect((await pg.query('SELECT key FROM "DiscordPost"')).rows).toEqual([]);
  });
  it("permet un message de règlement sans vente associée", async () => {
    await pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "nextAttemptAt") VALUES ('rules:guild', 'rules-channel', NULL)`);
    expect((await pg.query('SELECT "auctionId", "attempts", "nextAttemptAt" FROM "DiscordPost"')).rows).toEqual([{ auctionId: null, attempts: 0, nextAttemptAt: null }]);
  });
  it("garantit une publication par échange et interdit de mélanger vente et échange", async () => {
    await pg.exec(`INSERT INTO "TradeListing" VALUES ('l1');
      INSERT INTO "Auction" VALUES ('a3');
      INSERT INTO "DiscordPost" (key, "channelId", "listingId") VALUES ('listing:l1', 'channel', 'l1');`);
    await expect(pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "listingId") VALUES ('duplicate-listing', 'channel', 'l1')`)).rejects.toThrow();
    await expect(pg.exec(`UPDATE "DiscordPost" SET "auctionId"='a3' WHERE key='listing:l1'`)).rejects.toThrow();
    await pg.exec(`DELETE FROM "TradeListing" WHERE id='l1'; DELETE FROM "Auction" WHERE id='a3';`);
    expect((await pg.query(`SELECT key FROM "DiscordPost" WHERE key='listing:l1'`)).rows).toEqual([]);
  });
  it("garantit une seule annonce de saison, distincte des annonces du marché", async () => {
    await pg.exec(`INSERT INTO "Season" VALUES ('s4', '{"number":4}'); INSERT INTO "Auction" VALUES ('a4');
      INSERT INTO "DiscordPost" (key, "channelId", "seasonId") VALUES ('season:s4', 'ranked', 's4');`);
    await expect(pg.exec(`INSERT INTO "DiscordPost" (key, "channelId", "seasonId") VALUES ('duplicate-season', 'ranked', 's4')`)).rejects.toThrow();
    await expect(pg.exec(`UPDATE "DiscordPost" SET "auctionId"='a4' WHERE key='season:s4'`)).rejects.toThrow();
    await pg.exec(`DELETE FROM "Season" WHERE id='s4'; DELETE FROM "Auction" WHERE id='a4'`);
    expect((await pg.query(`SELECT key FROM "DiscordPost" WHERE key='season:s4'`)).rows).toEqual([]);
  });
  it("déduplique les tâches de compte lié par serveur et membre", async () => {
    await pg.exec(`INSERT INTO "DiscordRoleSync" ("guildId", "discordId") VALUES ('g1', 'u1')`);
    await expect(pg.exec(`INSERT INTO "DiscordRoleSync" ("guildId", "discordId") VALUES ('g1', 'u1')`)).rejects.toThrow();
    expect((await pg.query(`SELECT attempts, "leaseId" FROM "DiscordRoleSync"`)).rows).toEqual([{ attempts: 0, leaseId: null }]);
  });
});
