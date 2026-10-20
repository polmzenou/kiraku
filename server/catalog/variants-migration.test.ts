import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it } from "vitest";

describe("migration des variantes AR et Gold sur PostgreSQL isolé", () => {
  it("ajoute les deux raretés, complète les réglages existants sans écraser et protège les bases", async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations"), migration = "20261020200000_catalogue_variantes_ar_gold";
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f) && f < migration).sort()) {
        await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      await db.exec(`
        INSERT INTO "GameSetting" (key,value,"updatedAt") VALUES
          ('booster.rates','{"COMMON":80,"MYTHIC":25}',now()),
          ('collection.recycleValues','{"COMMON":1,"MYTHIC":550}',now()),
          ('trades.allowedRarities','["COMMON","GOLD"]',now()),
          ('gifts.allowedRarities','[]',now());
        INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('s','ANIME','One Piece','{}','{}');
        INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status)
          VALUES ('luffy','Luffy','https://blob/luffy.webp',0,'MYTHIC',90,70,'s','luffy',now(),'CUSTOM','PUBLISHED');
      `);
      await db.exec(readFileSync(resolve(root, migration, "migration.sql"), "utf8"));
      const rarities = await db.query<{ key: string; sortOrder: number; legacyBase: string; variantRequired: boolean }>(
        `SELECT key, "sortOrder", "legacyBase", "variantRequired" FROM "RarityDefinition" WHERE "sortOrder" >= 500 ORDER BY "sortOrder"`);
      expect(rarities.rows).toEqual([
        { key: "MYTHIC", sortOrder: 500, legacyBase: "MYTHIC", variantRequired: false },
        { key: "AR", sortOrder: 600, legacyBase: "MYTHIC", variantRequired: true },
        { key: "GOLD", sortOrder: 700, legacyBase: "MYTHIC", variantRequired: true },
      ]);
      const setting = async (key: string) => (await db.query<{ value: unknown }>(`SELECT value FROM "GameSetting" WHERE key=$1`, [key])).rows[0]?.value;
      expect(await setting("booster.rates")).toEqual({ COMMON: 80, MYTHIC: 15, AR: 8, GOLD: 2 });
      expect(await setting("collection.recycleValues")).toEqual({ COMMON: 1, MYTHIC: 550, AR: 1650, GOLD: 3850 });
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "GOLD", "AR"]);
      expect(await setting("gifts.allowedRarities")).toEqual(["AR", "GOLD"]);
      expect(await setting("battle.keywordsByRarity")).toBeUndefined();
      // Rejouée sur des réglages déjà complétés (ou réglés à la main), elle ne change rien.
      await db.exec(`UPDATE "GameSetting" SET value='{"COMMON":80,"MYTHIC":5,"AR":50}' WHERE key='booster.rates';
        UPDATE "GameSetting" SET value='{"COMMON":1}' WHERE key='collection.recycleValues';`);
      await db.exec(readFileSync(resolve(root, migration, "migration.sql"), "utf8").replace(/^ALTER TABLE[\s\S]*?;$|^CREATE INDEX.*$/gm, ""));
      expect(await setting("booster.rates")).toEqual({ COMMON: 80, MYTHIC: 5, AR: 50, GOLD: 0 });
      expect(await setting("collection.recycleValues")).toEqual({ COMMON: 1, AR: 450, GOLD: 1050 });
      expect(await setting("trades.allowedRarities")).toEqual(["COMMON", "GOLD", "AR"]);

      // Une variante Gold : l'ancienne colonne enum lit Mythique, la base ne peut plus être supprimée.
      await db.exec(`INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status,"variantOfId","formName")
        VALUES ('luffy-gold','Luffy','https://blob/luffy-gold.webp',0,'GOLD',99,80,'s','luffy',now(),'CUSTOM','DRAFT','luffy','Gold');`);
      expect((await db.query(`SELECT rarity, "variantOfId" FROM "Card" WHERE id='luffy-gold'`)).rows).toEqual([{ rarity: "MYTHIC", variantOfId: "luffy" }]);
      await expect(db.exec(`DELETE FROM "Card" WHERE id='luffy'`)).rejects.toThrow();
      await db.exec(`DELETE FROM "Card" WHERE id='luffy-gold'; DELETE FROM "Card" WHERE id='luffy';`);
    } finally { await db.close(); }
  }, 60_000);
});
