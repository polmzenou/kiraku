import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it } from "vitest";
import { VISUAL_PRESETS } from "@/lib/catalog/appearance";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";

describe("migration de la rareté Esprit sur PostgreSQL isolé", () => {
  it("place SR entre MR et XR, au poids moyen, et complète les réglages sans écraser", async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations"), migration = "20261118160000_rarete_esprit";
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f) && f < migration).sort()) {
        await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      await db.exec(`
        DELETE FROM "GameSetting" WHERE key IN ('booster.rates','collection.recycleValues','battle.keywordsByRarity','market.maxPriceByRarity',
          'booster.duplicateGuardRarities','trades.allowedRarities','gifts.allowedRarities','listings.allowedRarities','casino.coinflip.allowedRarities','battle.ultimateRarities');
        INSERT INTO "GameSetting" (key,value,"updatedAt") VALUES
          ('booster.rates','{"COMMON":80,"MYTHIC":15,"MR":6,"XR":3}',now()),
          ('collection.recycleValues','{"MYTHIC":200,"MR":1000,"XR":3000}',now()),
          ('battle.keywordsByRarity','{"MYTHIC":2,"MR":3,"XR":4}',now()),
          ('market.maxPriceByRarity','{"MYTHIC":5000,"MR":90000}',now()),
          ('booster.duplicateGuardRarities','["MYTHIC","MR","XR"]',now()),
          ('trades.allowedRarities','["COMMON","SR"]',now()),
          ('gifts.allowedRarities','[]',now()),
          ('casino.coinflip.allowedRarities','["MYTHIC"]',now()),
          ('battle.ultimateRarities','["GOLD","MR","XR"]',now());
      `);
      const sql = readFileSync(resolve(root, migration, "migration.sql"), "utf8");
      await db.exec(sql);

      const rows = (await db.query<{ key: string; nameFr: string; nameEn: string; sortOrder: number; seal: string; appearance: unknown; legacyBase: string; variantRequired: boolean }>(
        `SELECT key, "nameFr", "nameEn", "sortOrder", seal, appearance, "legacyBase", "variantRequired" FROM "RarityDefinition" WHERE "sortOrder" >= 700 ORDER BY "sortOrder", key`)).rows;
      expect(rows.map((r) => [r.key, r.sortOrder])).toEqual([["GOLD", 700], ["MR", 700], ["SR", 750], ["XR", 800]]);
      const sr = rows.find((r) => r.key === "SR")!;
      expect(sr).toMatchObject({ nameFr: "Esprit", nameEn: "Spirit", seal: "霊", legacyBase: "MYTHIC", variantRequired: true });
      // La migration, le préréglage et le repli sans base disent la même chose
      expect(sr.appearance).toEqual(VISUAL_PRESETS.SR);
      expect(BASE_DEFINITIONS.find((d) => d.key === "SR")).toMatchObject({ nameFr: sr.nameFr, nameEn: sr.nameEn, sortOrder: 750, seal: sr.seal, appearance: sr.appearance, variantRequired: true });

      const setting = async (key: string) => (await db.query<{ value: unknown }>(`SELECT value FROM "GameSetting" WHERE key=$1`, [key])).rows[0]?.value;
      // Un peu plus rare que MR (6), un peu moins que XR (3) : la moyenne arrondie au-dessus
      expect(await setting("booster.rates")).toEqual({ COMMON: 80, MYTHIC: 15, MR: 6, XR: 3, SR: 5 });
      expect(await setting("collection.recycleValues")).toEqual({ MYTHIC: 200, MR: 1000, XR: 3000, SR: 2000 });
      expect(await setting("battle.keywordsByRarity")).toEqual({ MYTHIC: 2, MR: 3, XR: 4, SR: 3 });
      expect(await setting("market.maxPriceByRarity")).toEqual({ MYTHIC: 5000, MR: 90000, SR: 90000 });
      expect(await setting("booster.duplicateGuardRarities")).toEqual(["MYTHIC", "MR", "XR", "SR"]);
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "SR"]);
      expect(await setting("gifts.allowedRarities")).toEqual(["SR"]);
      expect(await setting("casino.coinflip.allowedRarities")).toEqual(["MYTHIC", "SR"]);
      expect(await setting("battle.ultimateRarities")).toEqual(["GOLD", "MR", "XR", "SR"]);
      expect(await setting("listings.allowedRarities")).toBeUndefined();

      // Rejouée, elle ne change plus rien ; un poids réglé entre-temps reste, une règle coupée reste coupée
      await db.exec(`UPDATE "GameSetting" SET value = value || '{"SR":9}' WHERE key='booster.rates'`);
      await db.exec(`UPDATE "GameSetting" SET value='[]' WHERE key='booster.duplicateGuardRarities'`);
      await db.exec(sql);
      expect(await setting("booster.rates")).toMatchObject({ SR: 9 });
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "SR"]);
      expect(await setting("booster.duplicateGuardRarities")).toEqual([]);
      expect((await db.query(`SELECT 1 FROM "RarityDefinition" WHERE key='SR'`)).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 120_000);
});
