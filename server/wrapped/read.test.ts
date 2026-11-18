import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { yearWindow } from "@/lib/wrapped/period";
import { pickFavorite, zeniTotals } from "@/lib/wrapped/summary";
import { readCardWith, readWrappedWith } from "./read";

// Lectures du Wrapped sur le vrai schéma : toutes les migrations rejouées dans un Postgres en mémoire.

let pg: PGlite;
// Le template balisé de Prisma devient une requête paramétrée PGlite ($1, $2…)
const db = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((sql, part, i) => sql + part + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values.map((v) => (v instanceof Date ? v.toISOString() : v)))).rows;
  },
} as unknown as Pick<PrismaClient, "$queryRaw">;

const { start, end } = yearWindow(2026, "Europe/Paris");

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
  await pg.exec(`
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('me', 'akira', '{}'), ('rival', 'rival', '{}');
    INSERT INTO "Series" (id, type, "titleRomaji", genres, tags) VALUES ('s', 'ANIME', 'Série', '{}', '{}');
    INSERT INTO "Card" (id, name, "imageUrl", favorites, "rarityKey", power, ki, "seriesId", "searchText", "updatedAt") VALUES
      ('common', 'Commune', 'c.jpg', 1, 'COMMON', 1, 1, 's', 'c', now()),
      ('epic', 'Épique', 'e.jpg', 1, 'EPIC', 1, 1, 's', 'e', now()),
      ('mythic', 'Mythique', 'm.jpg', 1, 'MYTHIC', 1, 1, 's', 'm', now()),
      ('old-mythic', 'Mythique 2025', 'o.jpg', 1, 'MYTHIC', 1, 1, 's', 'o', now());
    -- Ouvertures : une en 2025 (hors année), trois en 2026 dont la dernière le 31 décembre à 23 h 30 à Paris (hors année)
    INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds", golden, divine, "zeniSpent", "createdAt") VALUES
      ('o0', 'me', 'standard', '{}', '{old-mythic}', false, false, 0, '2025-12-31T22:00:00Z'),
      ('o1', 'me', 'standard', '{}', '{common,epic,common}', true, false, 0, '2026-03-01T10:00:00Z'),
      ('o2', 'me', 'standard', '{}', '{common,mythic}', false, true, 200, '2026-06-01T10:00:00Z'),
      ('o3', 'me', 'standard', '{}', '{mythic}', false, false, 200, '2026-12-31T22:30:00Z'),
      ('o4', 'me', 'standard', '{}', '{epic}', false, false, 0, '2026-12-31T23:30:00Z');
    INSERT INTO "CoinTransaction" (id, "userId", amount, reason, "createdAt") VALUES
      ('t1', 'me', 1000, 'DAILY', '2026-02-01T00:00:00Z'),
      ('t2', 'me', -200, 'BOOSTER', '2026-06-01T10:00:00Z'),
      ('t3', 'me', -300, 'BID_HOLD', '2026-07-01T10:00:00Z'),
      ('t4', 'me', 300, 'BID_REFUND', '2026-07-02T10:00:00Z'),
      ('t5', 'me', 999, 'DAILY', '2025-06-01T10:00:00Z');
    INSERT INTO "UserCard" (id, "ownerId", "cardId") VALUES ('u-epic', 'me', 'epic'), ('u-common', 'me', 'common'), ('r-mythic', 'rival', 'mythic');
    -- Combats : le joueur en p1 puis en p2 ; l'épique est alignée deux fois
    INSERT INTO "Battle" (id, mode, status, seed, "p1Id", "p2Id", "p1Team", "p2Team", "winnerSide", "pcBeforeP1", "pcDeltaP1", "pcBeforeP2", "pcDeltaP2", "createdAt") VALUES
      ('b1', 'RANKED', 'FINISHED', 1, 'me', 'rival', '{u-epic,u-common}', '{r-mythic}', 0, 1000, 25, 1100, -25, '2026-05-01T10:00:00Z'),
      ('b2', 'RANKED', 'FINISHED', 2, 'rival', 'me', '{r-mythic}', '{u-epic}', 0, 1075, 20, 1025, -20, '2026-05-02T10:00:00Z'),
      ('b3', 'EXHIBITION', 'FINISHED', 3, 'me', 'rival', '{u-epic}', '{r-mythic}', 0, NULL, NULL, NULL, NULL, '2026-05-03T10:00:00Z'),
      ('b4', 'RANKED', 'ACTIVE', 4, 'me', 'rival', '{u-common}', '{r-mythic}', NULL, 1005, NULL, 1080, NULL, '2026-05-04T10:00:00Z');
    INSERT INTO "Discovery" ("userId", "cardId", "createdAt") VALUES ('me', 'epic', '2026-03-01T10:00:00Z'), ('me', 'old-mythic', '2025-12-31T22:00:00Z');
  `);
}, 120_000);
afterAll(async () => pg.close());

describe("lectures du Wrapped", () => {
  it("compte l'année du fuseau du jeu, ni avant ni après", async () => {
    const raw = await readWrappedWith(db, "me", start, end);
    expect(raw.username).toBe("akira");
    expect(raw.boosters).toEqual({ opened: 3, golden: 1, divine: 1, zeniSpent: 400 });
    expect(raw.pulledByRarity).toEqual({ COMMON: 3, EPIC: 1, MYTHIC: 2 });
    expect(raw.discoveries).toBe(1);
  });

  it("retient la carte la plus rare, la plus ancienne à égalité", async () => {
    const raw = await readWrappedWith(db, "me", start, end);
    expect(raw.bestPull).toMatchObject({ cardId: "mythic", name: "Mythique", rarity: "MYTHIC", imageUrl: "m.jpg" });
    // PGlite rend un timestamp sans fuseau en heure locale (Prisma, lui, en UTC) : on compare le jour
    expect(raw.bestPull?.at.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("additionne les Zeni de l'année par motif, séquestres neutralisés", async () => {
    const raw = await readWrappedWith(db, "me", start, end);
    expect(zeniTotals(raw.ledger)).toEqual({ earned: 1000, spent: 200, topSource: "DAILY" });
  });

  it("lit les combats terminés depuis le camp du joueur, et son meilleur PC en classé", async () => {
    const { battles, topBattleCard } = await readWrappedWith(db, "me", start, end);
    expect(battles).toEqual({ played: 3, won: 2, rankedPlayed: 2, rankedWon: 1, bestPc: 1025 });
    expect(topBattleCard).toEqual({ cardId: "epic", battles: 3 });
    expect(pickFavorite([topBattleCard!], null, "mythic")).toEqual({ cardId: "epic", source: "battle", battles: 3 });
  });

  it("rend une année vide sans erreur, et lit une carte à part", async () => {
    const raw = await readWrappedWith(db, "rival", yearWindow(2025, "Europe/Paris").start, yearWindow(2025, "Europe/Paris").end);
    expect(raw.boosters.opened).toBe(0);
    expect(raw.bestPull).toBeNull();
    expect(raw.battles.bestPc).toBeNull();
    expect(raw.showcaseCardId).toBeNull();
    expect(await readCardWith(db, "epic")).toMatchObject({ cardId: "epic", name: "Épique" });
    expect(await readCardWith(db, "nope")).toBeNull();
  });
});
