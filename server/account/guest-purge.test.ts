import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("../session", () => ({ SESSION_MAX_AGE: 90 * 24 * 60 * 60 }));

import { purgeInactiveGuestsWith } from "./guest-purge";

const DAY = 86_400_000;
const NOW = new Date("2026-10-28T04:30:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
// Session prolongée à une visite d'il y a `days` jours : elle expire 90 jours après
const sessionFrom = (days: number) => new Date(NOW.getTime() - days * DAY + 90 * DAY).toISOString();

let pg: PGlite;
// Le template balisé de Prisma devient une requête paramétrée PGlite ($1, $2…)
const db = {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((sql, part, i) => sql + part + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values.map((v) => (v instanceof Date ? v.toISOString() : v)))).rows;
  },
} as unknown as Pick<PrismaClient, "$queryRaw">;

async function user(id: string, opts: { guest?: boolean; createdDaysAgo: number; role?: string }) {
  await pg.query(`INSERT INTO "User" (id, username, "battleTeam", "isGuest", "createdAt", role) VALUES ($1, $1, '{}', $2, $3, $4::"Role")`, [
    id,
    opts.guest ?? true,
    ago(opts.createdDaysAgo),
    opts.role ?? "USER",
  ]);
}
const ids = async () => (await pg.query<{ id: string }>(`SELECT id FROM "User" ORDER BY id`)).rows.map((r) => r.id);

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await pg.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
}, 60_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(`DELETE FROM "User"`);
});

describe("purge des invités inactifs", () => {
  it("supprime l'invité ancien et inactif avec son journal, garde les actifs, les récents et les inscrits", async () => {
    await user("abandoned", { createdDaysAgo: 30 });
    await pg.query(`INSERT INTO "Session" (id, "sessionToken", "userId", expires) VALUES ('s0', 't0', 'abandoned', $1)`, [sessionFrom(20)]);
    await pg.query(`INSERT INTO "CoinTransaction" (id, "userId", amount, reason, "createdAt") VALUES ('c0', 'abandoned', 500, 'SIGNUP', $1)`, [ago(30)]);
    await user("orphan", { createdDaysAgo: 10 }); // laissé après une connexion Discord : plus aucune session

    await user("visiting", { createdDaysAgo: 30 });
    await pg.query(`INSERT INTO "Session" (id, "sessionToken", "userId", expires) VALUES ('s1', 't1', 'visiting', $1)`, [sessionFrom(2)]);
    await user("opener", { createdDaysAgo: 30 });
    await pg.query(`INSERT INTO "BoosterOpening" (id, "userId", "boosterSlug", "cardIds", "catalogCardIds", "createdAt") VALUES ('b1', 'opener', 'standard', '{}', '{}', $1)`, [ago(1)]);
    await user("spender", { createdDaysAgo: 30 });
    await pg.query(`INSERT INTO "CoinTransaction" (id, "userId", amount, reason, "createdAt") VALUES ('c1', 'spender', 10, 'SIGNUP', $1)`, [ago(3)]);
    await user("newcomer", { createdDaysAgo: 2 });
    await user("registered", { guest: false, createdDaysAgo: 400 });
    await user("staff", { createdDaysAgo: 400, role: "ADMIN" });

    expect(await purgeInactiveGuestsWith(db, NOW, { days: 7 })).toEqual({ deleted: 2, failed: 0 });
    expect(await ids()).toEqual(["newcomer", "opener", "registered", "spender", "staff", "visiting"]);
    // Cascade : journal et sessions partis avec le compte
    expect((await pg.query(`SELECT id FROM "CoinTransaction" ORDER BY id`)).rows).toEqual([{ id: "c1" }]);
    expect((await pg.query(`SELECT id FROM "Session" ORDER BY id`)).rows).toEqual([{ id: "s1" }]);
  });

  it("travaille par lots jusqu'à ce qu'il ne reste rien", async () => {
    for (let i = 0; i < 7; i++) await user(`g${i}`, { createdDaysAgo: 20 + i });
    expect(await purgeInactiveGuestsWith(db, NOW, { days: 7, batch: 3 })).toEqual({ deleted: 7, failed: 0 });
    expect(await ids()).toEqual([]);
  });

  it("0 jour : purge désactivée", async () => {
    await user("old", { createdDaysAgo: 365 });
    expect(await purgeInactiveGuestsWith(db, NOW, { days: 0 })).toEqual({ deleted: 0, failed: 0 });
    expect(await ids()).toEqual(["old"]);
  });

  it("un compte bloquant n'empêche pas de supprimer les autres", async () => {
    await user("a", { createdDaysAgo: 20 });
    await user("blocked", { createdDaysAgo: 21 });
    await user("c", { createdDaysAgo: 22 });
    // Une règle de la base refuse la suppression d'un compte précis (contrainte inattendue)
    await pg.exec(`
      CREATE FUNCTION refuse_blocked() RETURNS trigger AS $$
      BEGIN IF OLD.id = 'blocked' THEN RAISE EXCEPTION 'bloqué'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER refuse_blocked BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION refuse_blocked();`);
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await purgeInactiveGuestsWith(db, NOW, { days: 7 })).toEqual({ deleted: 2, failed: 1 });
      expect(await ids()).toEqual(["blocked"]);
    } finally {
      await pg.exec(`DROP TRIGGER refuse_blocked ON "User"; DROP FUNCTION refuse_blocked();`);
      vi.restoreAllMocks();
    }
  });
});
