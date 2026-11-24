import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration de l'Ennichi, rejouée avec toutes les migrations dans un Postgres isolé en mémoire : graine bien formée,
// tirage figé d'un bloc, un seul versement par palier et par joueur, un seul prix par rang ou par tirage.

const ROOT = resolve("prisma/migrations");
const read = (folder: string) => readFileSync(resolve(ROOT, folder, "migration.sql"), "utf8");
const HEX = "a".repeat(64);

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const folders = readdirSync(ROOT).filter((f) => /^\d/.test(f)).sort();
  expect(folders).toContain("20261124180000_ennichi");
  for (const folder of folders) await pg.exec(read(folder));
  await pg.exec(`INSERT INTO "User" (id, username, "battleTeam", "isGuest") VALUES ('u1', 'u1', '{}', false), ('u2', 'u2', '{}', false)`);
}, 120_000);
afterAll(async () => pg.close());

const refused = async (sql: string, constraint: RegExp) => {
  await expect(pg.exec(sql)).rejects.toThrow(constraint);
};

describe("migration de l'Ennichi", () => {
  it("une graine et son empreinte en hexadécimal ; le tirage se fige d'un bloc", async () => {
    await pg.exec(`INSERT INTO "EnnichiDraw" (edition, "seedHash", seed) VALUES (1, '${HEX}', '${HEX}')`);
    await refused(`INSERT INTO "EnnichiDraw" (edition, "seedHash", seed) VALUES (2, 'pas-hex', '${HEX}')`, /EnnichiDraw_hex_check/);
    await refused(`INSERT INTO "EnnichiDraw" (edition, "seedHash", seed) VALUES (0, '${HEX}', '${HEX}')`, /EnnichiDraw_edition_check/);
    await refused(`UPDATE "EnnichiDraw" SET "drawnAt" = now() WHERE edition = 1`, /EnnichiDraw_drawn_check/);
    await pg.exec(`UPDATE "EnnichiDraw" SET "drawnAt" = now(), "ticketsHash" = '${HEX}', tickets = '[]', prizes = '[]' WHERE edition = 1`);
  });

  it("un palier ne se verse qu'une fois par joueur", async () => {
    await pg.exec(`INSERT INTO "EnnichiTierReached" (edition, tier, lanterns) VALUES (1, 0, 25)`);
    await refused(`INSERT INTO "EnnichiTierReached" (edition, tier, lanterns) VALUES (1, 4, 25)`, /EnnichiTierReached_tier_check/);
    await pg.exec(`INSERT INTO "EnnichiTierGrant" (id, edition, tier, "userId") VALUES ('g1', 1, 0, 'u1')`);
    await refused(`INSERT INTO "EnnichiTierGrant" (id, edition, tier, "userId") VALUES ('g2', 1, 0, 'u1')`, /EnnichiTierGrant_edition_tier_userId_key/);
    await pg.exec(`INSERT INTO "EnnichiTierGrant" (id, edition, tier, "userId") VALUES ('g3', 1, 1, 'u1'), ('g4', 1, 0, 'u2')`);
  });

  it("un seul prix par rang du banzuke et par tirage de l'omikuji", async () => {
    await pg.exec(`INSERT INTO "EnnichiResult" (edition, rank, "userId", name, count, "reachedAt", title) VALUES (1, 1, 'u1', 'u1', 3, now(), 'yokozuna')`);
    await refused(`INSERT INTO "EnnichiResult" (edition, rank, name, count, "reachedAt", title) VALUES (1, 2, 'x', 1, now(), 'empereur')`, /EnnichiResult_title_check/);
    await pg.exec(`INSERT INTO "EnnichiAward" (id, edition, kind, ref, "userId", name, prize) VALUES ('a1', 1, 'BANZUKE', 1, 'u1', 'u1', '{}'), ('a2', 1, 'OMIKUJI', 1, 'u2', 'u2', '{}')`);
    await refused(`INSERT INTO "EnnichiAward" (id, edition, kind, ref, name, prize) VALUES ('a3', 1, 'OMIKUJI', 1, 'x', '{}')`, /EnnichiAward_edition_kind_ref_key/);
    // Compte supprimé : le pseudo et le prix restent, le joueur s'efface
    await pg.exec(`DELETE FROM "User" WHERE id = 'u2'`);
    const award = await pg.query<{ userId: string | null; name: string }>(`SELECT "userId", name FROM "EnnichiAward" WHERE id = 'a2'`);
    expect(award.rows[0]).toEqual({ userId: null, name: "u2" });
  });

  it("le nouveau motif de mouvement et la nouvelle notification existent", async () => {
    const reasons = await pg.query<{ v: string }>(`SELECT unnest(enum_range(NULL::"CoinReason"))::text AS v`);
    expect(reasons.rows.map((r) => r.v)).toContain("ENNICHI");
    const types = await pg.query<{ v: string }>(`SELECT unnest(enum_range(NULL::"NotificationType"))::text AS v`);
    expect(types.rows.map((r) => r.v)).toContain("ENNICHI_REWARD");
  });
});
