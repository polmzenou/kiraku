import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const reader = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: vi.fn() }));
vi.mock("../db", () => ({ prisma: { $queryRaw: reader.query } }));
vi.mock("../settings", () => ({ getSetting: vi.fn() }));
import { cardUsageCounts } from "./admin-queries";

// Usages des cartes de la liste du catalogue (suppression possible ou non), lus pour la page seulement : sur le
// schéma à jour, mêmes comptes que le `_count` de Prisma qu'ils remplacent.
describe("usages des cartes de la liste du catalogue", () => {
  const db = new PGlite({ extensions: { pg_trgm } });

  beforeAll(async () => {
    const root = resolve("prisma/migrations");
    for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
      await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
    await db.exec(`INSERT INTO "Series" (id,type,"titleRomaji",genres,tags) VALUES ('s','CUSTOM','Univers','{}','{}');
      INSERT INTO "User" (id,username) VALUES ('a','a'), ('b','b');`);
    for (const id of ["used", "free", "other"]) {
      await db.query(
        `INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status)
         VALUES ($1,$1,'',0,'COMMON',10,10,'s',$1,now(),'CUSTOM','DRAFT')`,
        [id],
      );
    }
    await db.exec(`
      INSERT INTO "Card" (id,name,"imageUrl",favorites,"rarityKey",power,ki,"seriesId","searchText","updatedAt",origin,status,"variantOfId")
        VALUES ('variant','variant','',0,'COMMON',10,10,'s','variant',now(),'CUSTOM','DRAFT','used');
      INSERT INTO "UserCard" (id,"ownerId","cardId") VALUES ('u1','a','used'), ('u2','a','used'), ('u3','b','used'), ('u4','b','other');
      INSERT INTO "Discovery" ("userId","cardId") VALUES ('a','used'), ('b','used'), ('b','other');
      INSERT INTO "WishlistEntry" ("userId","cardId",position) VALUES ('a','used',1);
      INSERT INTO "Trade" (id,"proposerId","recipientId","wantedCardId","chosenCardId","expiresAt") VALUES ('t1','a','b','used','other',now());
      INSERT INTO "TradeOffer" ("tradeId","cardId") VALUES ('t1','used');`);
    reader.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values);
      return (await db.query(query.text, [...query.values])).rows;
    });
  }, 120_000);

  afterAll(() => db.close());

  it("compte chaque usage par carte, zéro partout pour une carte libre", async () => {
    const counts = await cardUsageCounts(["used", "free", "other"]);
    expect(counts.get("used")).toEqual({
      copies: 3, discoveries: 2, wishedBy: 1, lotItems: 0, auctions: 0, notablePulls: 0,
      tradesWanted: 1, tradesChosen: 0, tradeOffers: 1, variants: 1, abilityPurchases: 0, consecrations: 0,
    });
    expect(counts.get("other")).toMatchObject({ copies: 1, discoveries: 1, tradesChosen: 1, tradesWanted: 0 });
    expect(Object.values(counts.get("free")!).every((n) => n === 0)).toBe(true);
    expect(await cardUsageCounts([])).toEqual(new Map());
  });
});
