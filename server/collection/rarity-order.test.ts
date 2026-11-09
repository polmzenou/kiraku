import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { parseCollectionParams } from "@/lib/collection/params";

const reader = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { $queryRaw: reader.query } }));
import { getCollectionPage } from "./queries";

// Une Black Edition (BR) a le même sortOrder qu'une Mythique, et les variantes n'ont pas de numéro :
// sans départage, elles tombaient après les Mythiques, donc entre Mythiques et Légendaires.
describe("ordre des raretés dans la collection, sur le schéma à jour", () => {
  const db = new PGlite({ extensions: { pg_trgm } });

  beforeAll(async () => {
    const root = resolve("prisma/migrations");
    for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
      await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
    await db.exec(`INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('s','CUSTOM','Univers','{}','{}');
      INSERT INTO "User" (id,username) VALUES ('owner','OrderTester');`);
    const cards: [string, number | null][] = [["LEGENDARY", 3], ["MYTHIC", 1], ["BR", null], ["AR", null]];
    for (const [rarity, rank] of cards) {
      await db.query(
        `INSERT INTO "Card" (id,name,"imageUrl",favorites,rank,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status)
         VALUES ($1,$1,'',0,$2,$3,10,10,'s',lower($1),now(),'CUSTOM','PUBLISHED')`,
        [`card-${rarity}`, rank, rarity],
      );
      await db.query(`INSERT INTO "UserCard" (id,"ownerId","cardId") VALUES ($1,'owner',$2)`, [`copy-${rarity}`, `card-${rarity}`]);
    }
    reader.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values);
      return (await db.query(query.text, [...query.values])).rows;
    });
  }, 120_000);

  afterAll(() => db.close());

  it("place les BE entre les AR et les Mythiques, dans les deux sens", async () => {
    const order = async (dir: "asc" | "desc") =>
      (await getCollectionPage("owner", parseCollectionParams({ sort: "rarity", dir }), 0, "fr")).items.map((c) => c.rarity);
    expect(await order("desc")).toEqual(["AR", "BR", "MYTHIC", "LEGENDARY"]);
    expect(await order("asc")).toEqual(["LEGENDARY", "MYTHIC", "BR", "AR"]);
  });
});
