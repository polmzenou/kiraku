import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('CREATE TABLE "Auction" (id TEXT PRIMARY KEY);');
  await pg.exec(readFileSync(resolve("prisma/migrations/20261030120000_discord_community/migration.sql"), "utf8"));
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
});
