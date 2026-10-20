import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { parseCollectionParams } from "@/lib/collection/params";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeCharacter } from "@/lib/catalog/anilist";
import { rawCharacter } from "@/lib/catalog/fixtures";
import type { FinalEntry } from "./import";
import { prismaImportStore } from "./prisma-store";
const reader = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { $queryRaw: reader.query } }));
import { getAlbumPage } from "../collection/albums";
import { getCollectionPage } from "../collection/queries";

describe("migration du catalogue sur PostgreSQL isolé", () => {
  it("préserve les URL, collections, historiques et réglages, puis accepte des cartes sans AniList", async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations"), migration = "20261020010000_admin_catalogue";
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f) && f < migration).sort()) {
        await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      await db.exec(`
        INSERT INTO "Series" (id,"anilistId",type,"titleRomaji",genres,tags) VALUES ('series',1,'ANIME','Universe','{}','{}');
        INSERT INTO "Card" (id,"anilistId",name,"imageUrl",favorites,rank,rarity,power,ki,"seriesId","searchText","updatedAt") VALUES
          ('active',765,'Existing','https://s4.anilist.co/a.jpg',100,1,'MYTHIC',99,80,'series','existing',now()),
          ('retired',123,'Retired','https://s4.anilist.co/b.jpg',1,null,'COMMON',40,30,'series','retired',now());
        INSERT INTO "User" (id,username,"battleTeam") VALUES ('owner','MigrationTester','{}');
        INSERT INTO "UserCard" (id,"ownerId","cardId") VALUES ('copy','owner','active');
        INSERT INTO "Discovery" ("userId","cardId") VALUES ('owner','active');
        INSERT INTO "BoosterOpening" (id,"userId","boosterSlug","cardIds","catalogCardIds") VALUES ('opening','owner','standard','{copy}','{active}');
        INSERT INTO "GameSetting" (key,value,"updatedAt") VALUES ('booster.rates','{"COMMON":80,"MYTHIC":20}',now());
      `);
      await db.exec(readFileSync(resolve(root, migration, "migration.sql"), "utf8"));
      expect((await db.query(`SELECT "publicId", "anilistId", status, "dropWeight", power FROM "Card" WHERE id='active'`)).rows).toEqual([{ publicId: 765, anilistId: 765, status: "PUBLISHED", dropWeight: 1, power: 99 }]);
      expect((await db.query(`SELECT status FROM "Card" WHERE id='retired'`)).rows).toEqual([{ status: "ARCHIVED" }]);
      expect((await db.query(`SELECT "cardId" FROM "UserCard" WHERE id='copy'`)).rows).toEqual([{ cardId: "active" }]);
      expect((await db.query(`SELECT "catalogCardIds" FROM "BoosterOpening" WHERE id='opening'`)).rows).toEqual([{ catalogCardIds: ["active"] }]);
      expect((await db.query(`SELECT value FROM "GameSetting" WHERE key='booster.rates'`)).rows).toEqual([{ value: { COMMON: 80, MYTHIC: 20 } }]);
      expect((await db.query(`SELECT count(*)::int AS n FROM "RarityDefinition"`)).rows).toEqual([{ n: 6 }]);
      expect((await db.query(`SELECT enum_range(NULL::"Rarity")::text AS values`)).rows).toEqual([{ values: "{COMMON,UNCOMMON,RARE,EPIC,LEGENDARY,MYTHIC}" }]);
      const legacyColumns = await db.query<{ udt_name: string }>(`SELECT udt_name FROM information_schema.columns WHERE table_name IN ('Card','NotablePull','LotItem','Mission') AND column_name='rarity'`);
      expect(legacyColumns.rows).toHaveLength(4);
      expect(legacyColumns.rows.every((c) => c.udt_name === "Rarity")).toBe(true);
      await db.exec(`INSERT INTO "RarityDefinition" (key,"nameFr","nameEn","sortOrder",seal,"legacyBase") VALUES ('CELESTIAL','Céleste','Celestial',600,'星','MYTHIC');
        INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('custom-universe','CUSTOM','Original','{}','{}');
        INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status)
        VALUES ('custom','Created','',0,'CELESTIAL',70,50,'custom-universe','created',now(),'CUSTOM','DRAFT');`);
      const [custom] = (await db.query<{ publicId: number; anilistId: null; rarity: string }>(`SELECT "publicId", "anilistId", "rarityKey" AS rarity FROM "Card" WHERE id='custom'`)).rows;
      expect(custom.publicId).toBeGreaterThan(765); expect(custom.anilistId).toBeNull(); expect(custom.rarity).toBe("CELESTIAL");
      expect((await db.query(`SELECT rarity FROM "Card" WHERE id='custom'`)).rows).toEqual([{ rarity: "MYTHIC" }]);
      // Requêtes de l'ancien importeur, sans connaissance des colonnes ajoutées.
      await db.exec(`INSERT INTO "Card" (id,"anilistId",name,"imageUrl",favorites,rank,rarity,power,ki,"seriesId","searchText","updatedAt")
        VALUES ('legacy',876,'Legacy','',0,2,'EPIC'::"Rarity",70,50,'series','legacy',now());`);
      expect((await db.query(`SELECT "publicId", "rarityKey", status FROM "Card" WHERE "anilistId"=876 AND rarity='EPIC'::"Rarity"`)).rows).toEqual([{ publicId: 876, rarityKey: "EPIC", status: "PUBLISHED" }]);
      await db.exec(`UPDATE "Card" SET rarity='LEGENDARY'::"Rarity", rank=NULL WHERE id='legacy'`);
      expect((await db.query(`SELECT "rarityKey", status FROM "Card" WHERE id='legacy'`)).rows).toEqual([{ rarityKey: "LEGENDARY", status: "ARCHIVED" }]);
      await expect(db.exec(`UPDATE "Card" SET "dropWeight"=-1 WHERE id='custom'`)).rejects.toThrow();
      await expect(db.exec(`DELETE FROM "RarityDefinition" WHERE key='CELESTIAL'`)).rejects.toThrow();
      await db.exec(`UPDATE "Card" SET status='PUBLISHED' WHERE id='custom';
        INSERT INTO "UserCard" (id,"ownerId","cardId") VALUES ('custom-copy','owner','custom');`);
      reader.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = Prisma.sql(strings, ...values);
        return (await db.query(query.text, [...query.values])).rows;
      });
      const collection = await getCollectionPage("owner", parseCollectionParams({ tri: "rarity" }), 0, "fr");
      expect(collection.items.map((c) => c.rarity)).toEqual(["CELESTIAL", "MYTHIC"]);
      expect(collection.items[0].anilistId).toBe(custom.publicId);
      const albums = await getAlbumPage("owner", { q: "", sort: "az", all: true }, 0, "fr");
      expect(albums.items.find((a) => a.seriesId === "custom-universe")?.byRarity.CELESTIAL).toEqual({ owned: 1, total: 1 });

      // Exécution des vraies requêtes de l'importeur actuel, après une édition admin.
      await db.exec(`UPDATE "Card" SET name='Admin name', power=123, "rarityKey"='CELESTIAL', status='ARCHIVED', "adminOverrides"='{name,power,rarity,status}' WHERE id='active'`);
      const customBefore = (await db.query(`SELECT * FROM "Card" WHERE id='custom'`)).rows;
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = Prisma.sql(strings, ...values); return (await db.query(query.text, [...query.values])).affectedRows;
        },
        catalogImport: { updateMany: async () => ({ count: 1 }) },
        gameSetting: { upsert: async (args: { where: { key: string }; update: { value: unknown } }) => {
          await db.query(`INSERT INTO "GameSetting" (key,value,"updatedAt") VALUES ($1,$2::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [args.where.key, JSON.stringify(args.update.value)]);
        } },
      };
      const client = { $transaction: async (run: (t: typeof tx) => Promise<void>) => {
        await db.exec("BEGIN");
        try { await run(tx); await db.exec("COMMIT"); } catch (error) { await db.exec("ROLLBACK"); throw error; }
      }, catalogImportRow: { deleteMany: async () => ({ count: 0 }) } } as unknown as PrismaClient;
      const incoming = [765,987].map((anilistId, i): FinalEntry => {
        const normalized = normalizeCharacter(rawCharacter({ id: anilistId }), 60);
        if (!normalized.ok) throw new Error("Invalid fixture");
        return { anilistId, rank: i+1, position: i+1, favorites: 100, rarity: "COMMON", power: 40, ki: 30, data: normalized.character };
      });
      await prismaImportStore(client).finalize("reimport", incoming);
      expect((await db.query(`SELECT name,power,"rarityKey",status,"publicId" FROM "Card" WHERE id='active'`)).rows).toEqual([{ name: "Admin name", power: 123, rarityKey: "CELESTIAL", status: "ARCHIVED", publicId: 765 }]);
      expect((await db.query(`SELECT rarity,"rarityKey","publicId" FROM "Card" WHERE "anilistId"=987`)).rows).toEqual([{ rarity: "COMMON", rarityKey: "COMMON", publicId: 987 }]);
      expect((await db.query(`SELECT * FROM "Card" WHERE id='custom'`)).rows).toEqual(customBefore);
    } finally { await db.close(); }
  }, 60_000);
});
