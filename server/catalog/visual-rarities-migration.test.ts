import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it } from "vitest";
import { VISUAL_PRESETS } from "@/lib/catalog/appearance";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";

describe("migration des raretés visuelles sur PostgreSQL isolé", () => {
  it("place BR, VR, MR et XR à leur rang, au poids 0, et complète les réglages sans écraser", async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations"), migration = "20261102120000_raretes_visuelles";
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f) && f < migration).sort()) {
        await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      await db.exec(`
        DELETE FROM "GameSetting" WHERE key IN ('booster.rates','collection.recycleValues','battle.keywordsByRarity','market.maxPriceByRarity','booster.duplicateGuardRarities','trades.allowedRarities','gifts.allowedRarities','listings.allowedRarities');
        INSERT INTO "GameSetting" (key,value,"updatedAt") VALUES
          ('booster.rates','{"COMMON":80,"MYTHIC":15,"AR":8,"GOLD":2,"XR":7}',now()),
          ('collection.recycleValues','{"MYTHIC":200,"AR":500,"GOLD":1100,"BR":9}',now()),
          ('battle.keywordsByRarity','{"MYTHIC":2,"AR":2,"GOLD":3}',now()),
          ('market.maxPriceByRarity','{"MYTHIC":5000,"GOLD":90000}',now()),
          ('booster.duplicateGuardRarities','["MYTHIC","GOLD"]',now()),
          ('trades.allowedRarities','["COMMON","VR"]',now()),
          ('gifts.allowedRarities','[]',now());
      `);
      const sql = readFileSync(resolve(root, migration, "migration.sql"), "utf8");
      await db.exec(sql);

      const rows = (await db.query<{ key: string; sortOrder: number; seal: string; appearance: unknown; legacyBase: string; variantRequired: boolean }>(
        `SELECT key, "sortOrder", seal, appearance, "legacyBase", "variantRequired" FROM "RarityDefinition" WHERE "sortOrder" >= 500 ORDER BY "sortOrder", key`)).rows;
      expect(rows.map((r) => [r.key, r.sortOrder])).toEqual([["BR", 500], ["MYTHIC", 500], ["AR", 600], ["VR", 600], ["GOLD", 700], ["MR", 700], ["XR", 800]]);
      for (const key of ["MR", "VR", "XR", "BR"] as const) {
        const row = rows.find((r) => r.key === key)!;
        expect(row).toMatchObject({ legacyBase: "MYTHIC", variantRequired: true });
        // La migration, le préréglage et le repli sans base disent la même chose
        expect(row.appearance).toEqual(VISUAL_PRESETS[key]);
        expect(BASE_DEFINITIONS.find((d) => d.key === key)).toMatchObject({ sortOrder: row.sortOrder, seal: row.seal, appearance: row.appearance, variantRequired: true });
      }

      const setting = async (key: string) => (await db.query<{ value: unknown }>(`SELECT value FROM "GameSetting" WHERE key=$1`, [key])).rows[0]?.value;
      expect(await setting("booster.rates")).toEqual({ COMMON: 80, MYTHIC: 15, AR: 8, GOLD: 2, XR: 7, BR: 0, VR: 0, MR: 0 });
      // Chaque rareté reprend la valeur réglée pour son rang, XR passe au-dessus ; une valeur déjà là reste
      expect(await setting("collection.recycleValues")).toEqual({ MYTHIC: 200, AR: 500, GOLD: 1100, BR: 9, VR: 500, MR: 1100, XR: 3000 });
      expect(await setting("battle.keywordsByRarity")).toEqual({ MYTHIC: 2, AR: 2, GOLD: 3, BR: 2, VR: 2, MR: 3, XR: 4 });
      expect(await setting("market.maxPriceByRarity")).toEqual({ MYTHIC: 5000, GOLD: 90000, BR: 5000, MR: 90000 });
      expect(await setting("booster.duplicateGuardRarities")).toEqual(["MYTHIC", "GOLD", "BR", "VR", "MR", "XR"]);
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "VR", "BR", "MR", "XR"]);
      expect(await setting("gifts.allowedRarities")).toEqual(["BR", "VR", "MR", "XR"]);
      expect(await setting("listings.allowedRarities")).toBeUndefined();

      // Rejouée, elle ne change plus rien, et une règle anti-doublons coupée reste coupée
      await db.exec(`UPDATE "GameSetting" SET value='[]' WHERE key='booster.duplicateGuardRarities'`);
      await db.exec(sql);
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "VR", "BR", "MR", "XR"]);
      expect(await setting("booster.duplicateGuardRarities")).toEqual([]);
    } finally {
      await db.close();
    }
  }, 120_000);
});
