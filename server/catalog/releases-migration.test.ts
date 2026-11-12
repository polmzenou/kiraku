import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it } from "vitest";

describe("migration des dates de sortie des cartes sur PostgreSQL isolé", () => {
  it("date les créations publiées depuis le journal admin, sinon leur création, et laisse AniList et les brouillons vides", async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    try {
      const root = resolve("prisma/migrations"), migration = "20261112120000_cartes_nouvelles";
      for (const folder of readdirSync(root).filter((f) => /^\d/.test(f) && f < migration).sort()) {
        await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
      }
      await db.exec(`
        INSERT INTO "User" (id,username,"battleTeam") VALUES ('admin','Admin','{}');
        INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('s','ANIME','One Piece','{}','{}');
        INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","createdAt","updatedAt",origin,status) VALUES
          ('logged','Luffy Gear 5','https://blob/a.webp',0,'MYTHIC',90,70,'s','luffy','2026-11-01T10:00:00Z',now(),'CUSTOM','PUBLISHED'),
          ('unlogged','Zoro','https://blob/b.webp',0,'MYTHIC',90,70,'s','zoro','2026-10-01T10:00:00Z',now(),'CUSTOM','PUBLISHED'),
          ('archived','Nami','https://blob/c.webp',0,'MYTHIC',90,70,'s','nami','2026-10-02T10:00:00Z',now(),'CUSTOM','ARCHIVED'),
          ('draft','Usopp','https://blob/d.webp',0,'MYTHIC',90,70,'s','usopp','2026-10-03T10:00:00Z',now(),'CUSTOM','DRAFT'),
          ('anilist','Sanji','https://blob/e.webp',0,'MYTHIC',90,70,'s','sanji','2026-09-01T10:00:00Z',now(),'ANILIST','PUBLISHED');
        INSERT INTO "AdminLog" (id,"adminId",action,"targetType","targetId","after","createdAt") VALUES
          ('l1','admin','CARD_CREATE','Card','logged','{"status":"DRAFT"}','2026-11-01T10:00:00Z'),
          ('l2','admin','CARD_BULK_PUBLISH','Card','logged','{"status":"PUBLISHED"}','2026-11-11T18:00:00Z'),
          ('l3','admin','CARD_UPDATE','Card','logged','{"status":"PUBLISHED"}','2026-11-12T09:00:00Z'),
          ('l4','admin','CARD_BULK_PUBLISH','Card','anilist','{"status":"PUBLISHED"}','2026-11-11T18:00:00Z'),
          ('l5','admin','SETTING_UPDATE','GameSetting','logged','{"status":"PUBLISHED"}','2026-10-15T00:00:00Z');
      `);
      await db.exec(readFileSync(resolve(root, migration, "migration.sql"), "utf8"));

      // En texte : un TIMESTAMP sans fuseau reviendrait en Date lue dans le fuseau de la machine
      const rows = await db.query<{ id: string; at: string | null }>(`SELECT id, to_char("publishedAt", 'YYYY-MM-DD HH24:MI') AS at FROM "Card" ORDER BY id`);
      const at = Object.fromEntries(rows.rows.map((r) => [r.id, r.at]));
      expect(at).toEqual({
        // Première publication du journal (la ligne d'un autre type de cible ne compte pas)
        logged: "2026-11-11 18:00",
        // Pas de trace dans le journal : date de création
        unlogged: "2026-10-01 10:00",
        archived: "2026-10-02 10:00",
        draft: null,
        // Import AniList : jamais une nouvelle carte, même publiée depuis l'admin
        anilist: null,
      });
      const index = await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'Card' AND indexname = 'Card_origin_publishedAt_idx'`);
      expect(index.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 120_000);
});
