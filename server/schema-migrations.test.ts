import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Les migrations sont écrites à la main (jamais de migrate dev ni de db push) : ce test vérifie qu'elles créent bien
// ce que décrit prisma/schema.prisma. Deux bases PGlite en mémoire : l'une reçoit toutes les migrations dans l'ordre des
// noms (comme migrate deploy), l'autre le SQL que Prisma déduit du schéma seul (migrate diff --from-empty). Une colonne,
// un index, une clé étrangère (et son onDelete), une contrainte unique, une valeur par défaut ou une valeur d'enum
// présente d'un côté et pas de l'autre fait échouer le test.
// Restent propres aux migrations, parce que Prisma ne sait pas les décrire : les CHECK, les index partiels, les
// déclencheurs et leurs fonctions, la table UNLOGGED (RateLimit). Sont aussi tolérés : le NOT NULL posé sur certaines
// colonnes tableau (Prisma les crée nullables mais écrit toujours un tableau), une clé étrangère posée NOT VALID
// (vérifiée à chaque écriture) et l'ordre des valeurs d'enum (ALTER TYPE … ADD VALUE ajoute à la fin).
// Un index que Prisma ne sait pas décrire autrement (expression, opérateurs) doit être partiel ou ajouté ici.

// Aucune base n'est visée (migrate diff --from-empty ne lit que le schéma) ; les URL mortes écartent par prudence
// celles du .env local, que prisma.config.ts charge. CHECKPOINT_DISABLE : pas de vérification de version en ligne.
const NO_DB = "postgresql://schema-check@127.0.0.1:1/none";

function prismaSchemaSql(): string {
  const run = spawnSync(
    process.execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: NO_DB, DIRECT_URL: NO_DB, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    },
  );
  if (run.status !== 0) throw new Error(`prisma migrate diff a échoué : ${run.stderr || run.error?.message}`);
  return run.stdout;
}

async function migratedDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  const root = resolve("prisma/migrations");
  for (const folder of readdirSync(root).filter((f) => /^\d/.test(f)).sort()) {
    await db.exec(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
  }
  return db;
}

async function schemaDb(sql: string): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  // Ce que le schéma suppose déjà en place : l'extension de la recherche (index gin_trgm_ops) et la fonction du code
  // de parrainage (@default(dbgenerated("kiraku_referral_code()")), écrite par les migrations)
  await db.exec(`CREATE EXTENSION pg_trgm; CREATE FUNCTION kiraku_referral_code() RETURNS text LANGUAGE sql AS $$ SELECT ''::text $$;`);
  await db.exec(sql);
  return db;
}

type Row = Record<string, string | boolean | null>;

/** Forme de la base que Prisma sait décrire : objet → définition normalisée. */
async function shapeOf(db: PGlite): Promise<Map<string, string>> {
  const rows = async (sql: string) => (await db.query<Row>(sql)).rows;
  const shape = new Map<string, string>();
  for (const r of await rows(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`)) {
    shape.set(`table ${r.t}`, "");
  }
  for (const r of await rows(`SELECT c.relname AS t, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type,
        a.attnotnull AS nn, pg_get_expr(d.adbin, d.adrelid) AS def
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`)) {
    const type = String(r.type);
    const notNull = type.endsWith("[]") ? "" : r.nn ? " NOT NULL" : "";
    // '{}'::text[] et ARRAY[]::text[] : même tableau vide
    const def = r.def === null ? "" : ` DEFAULT ${String(r.def).replace(/^'\{\}'::(.+)$/, "ARRAY[]::$1")}`;
    shape.set(`colonne ${r.t}.${r.col}`, `${type}${notNull}${def}`);
  }
  for (const r of await rows(`SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname = 'public'`)) {
    if (/ WHERE /.test(String(r.def))) continue;
    shape.set(`index ${r.name}`, String(r.def));
  }
  for (const r of await rows(`SELECT c.relname AS t, k.conname AS name, k.contype AS kind, pg_get_constraintdef(k.oid) AS def
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND k.contype <> 'c'`)) {
    shape.set(`contrainte ${r.t}.${r.name}`, String(r.def).replace(/ NOT VALID$/, ""));
  }
  for (const r of await rows(`SELECT t.typname AS name, string_agg(e.enumlabel, ',' ORDER BY e.enumlabel) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`)) {
    shape.set(`enum ${r.name}`, String(r.labels));
  }
  return shape;
}

function differences(migrations: Map<string, string>, schema: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [key, def] of migrations) {
    if (schema.get(key) !== def) out.push(`${key}\n  migrations : ${def}\n  schéma     : ${schema.get(key) ?? "(absent)"}`);
  }
  for (const [key, def] of schema) if (!migrations.has(key)) out.push(`${key}\n  migrations : (absent)\n  schéma     : ${def}`);
  return out;
}

describe("prisma/schema.prisma et prisma/migrations", () => {
  let migrated: PGlite;
  let fromSchema: PGlite;

  beforeAll(async () => {
    const sql = prismaSchemaSql();
    [migrated, fromSchema] = await Promise.all([migratedDb(), schemaDb(sql)]);
  }, 180_000);

  afterAll(async () => {
    await Promise.all([migrated?.close(), fromSchema?.close()]);
  });

  it("les migrations créent exactement ce que décrit le schéma", async () => {
    const [m, s] = await Promise.all([shapeOf(migrated), shapeOf(fromSchema)]);
    expect(differences(m, s)).toEqual([]);
    // Garde-fou du test lui-même : il a bien lu les deux bases
    expect(m.size).toBeGreaterThan(1000);
  });

  it("les gardes de l'argent et des cartes propres aux migrations sont en place", async () => {
    const names = async (sql: string) => (await migrated.query<{ name: string }>(sql)).rows.map((r) => r.name);
    const checks = await names(`SELECT conname AS name FROM pg_constraint WHERE contype = 'c'`);
    expect(checks).toEqual(
      expect.arrayContaining([
        "User_coins_nonnegative",
        "BoosterCredit_count_nonnegative",
        "Auction_bid_has_bidder",
        "Bid_amount_positive",
        "BuyOrder_amounts",
        "Purchase_amount_nonnegative",
        "KyaraImport_done_check",
      ]),
    );
    // Uniques partiels : un exemplaire en vente ou misé une seule fois, une expédition active par joueur, un numéro gravé unique
    const unique = await names(`SELECT indexname AS name FROM pg_indexes WHERE indexdef LIKE 'CREATE UNIQUE INDEX % WHERE %'`);
    expect(unique).toEqual(
      expect.arrayContaining([
        "Auction_userCardId_active_key",
        "CoinFlip_open_stake_key",
        "Expedition_userId_active_key",
        "UserCard_engraved_key",
        "ConsecratedCard_engraved_key",
        "ReferralReward_step_once",
      ]),
    );
  });
});
