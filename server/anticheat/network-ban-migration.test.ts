import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Migration des bans réseau, rejouée après toutes les autres dans un Postgres isolé en mémoire.

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
}, 120_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`
    DELETE FROM "NetworkBan";
    DELETE FROM "User";
    INSERT INTO "User" (id, username, "battleTeam") VALUES ('admin', 'admin', '{}'), ('cheater', 'cheater', '{}');
  `);
});

async function ban(values: string) {
  await pg.exec(`INSERT INTO "NetworkBan" (id, kind, value, source, reason, "userId", "createdById", "parentId", "expiresAt") VALUES ${values}`);
}

const count = async (where = "true") => (await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "NetworkBan" WHERE ${where}`)).rows[0].n;

describe("migration des bans réseau", () => {
  it("n'accepte qu'un ban par IP ou appareil", async () => {
    await ban(`('b1', 'IP', '86.245.12.3', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await expect(ban(`('b2', 'IP', '86.245.12.3', 'GROUP', 'triche', 'cheater', 'admin', NULL, NULL)`)).rejects.toThrow();
    // Même valeur, autre type : distinct
    await ban(`('b3', 'DEVICE', '86.245.12.3', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    expect(await count()).toBe(2);
  });

  it("réserve le parent et l'expiration aux bans automatiques", async () => {
    await ban(`('dev', 'DEVICE', '${"a".repeat(32)}', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await expect(ban(`('m1', 'IP', '1.1.1.1', 'MANUAL', 'triche', 'cheater', 'admin', 'dev', NULL)`)).rejects.toThrow();
    await expect(ban(`('m2', 'IP', '1.1.1.2', 'GROUP', 'triche', 'cheater', 'admin', NULL, now())`)).rejects.toThrow();
    await ban(`('a1', 'IP', '1.1.1.3', 'AUTO', 'triche', 'cheater', 'admin', 'dev', now() + interval '30 days')`);
    // Rendu définitif : plus de parent ni d'expiration, toujours AUTO
    await ban(`('a2', 'IP', '1.1.1.4', 'AUTO', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await expect(pg.exec(`UPDATE "NetworkBan" SET hits = -1 WHERE id = 'a1'`)).rejects.toThrow();
  });

  it("garde le ban quand le compte d'origine ou l'admin disparaît", async () => {
    await ban(`('b1', 'IP', '86.245.12.3', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await pg.exec(`DELETE FROM "User" WHERE id IN ('cheater', 'admin')`);
    const row = (await pg.query<{ userId: string | null; createdById: string | null }>(`SELECT "userId", "createdById" FROM "NetworkBan" WHERE id = 'b1'`)).rows[0];
    expect(row).toEqual({ userId: null, createdById: null });
  });

  it("lève les IP suivies avec l'appareil qui les a fait bannir", async () => {
    await ban(`('dev', 'DEVICE', '${"a".repeat(32)}', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await ban(`('a1', 'IP', '1.1.1.3', 'AUTO', 'triche', 'cheater', 'admin', 'dev', now() + interval '30 days')`);
    await ban(`('a2', 'IP', '2a01:cb00:1:2::/64', 'AUTO', 'triche', 'cheater', 'admin', 'dev', now() + interval '30 days')`);
    await ban(`('other', 'IP', '1.1.1.9', 'MANUAL', 'triche', 'cheater', 'admin', NULL, NULL)`);
    await pg.exec(`DELETE FROM "NetworkBan" WHERE id = 'dev'`);
    expect(await count()).toBe(1);
    expect(await count(`id = 'other'`)).toBe(1);
  });
});
