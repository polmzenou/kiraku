// Read-only preflight/postflight for the additive catalogue migration. Never applies SQL.
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Prisma, PrismaClient } from "../generated/prisma/client.ts";

config({ path: [".env.local", ".env"], quiet: true });
const migration = "20261020010000_admin_catalogue";
const after = process.argv.includes("--after");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquante");
const identity = (value: string) => { const u = new URL(value); return `${u.hostname.replace("-pooler.", ".")}:${u.port || "5432"}${u.pathname}`; };
const direct = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (direct && identity(url) !== identity(direct)) throw new Error("Application et migrations ciblent des bases différentes.");
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
const root = resolve("prisma/migrations");
const reportRoot = resolve("reports/catalogue");
const additions: Record<string, string[]> = {
  Card: ["rarityKey", "publicId", "origin", "status", "description", "appearance", "dropWeight", "adminOverrides", "boosterIds"],
  NotablePull: ["rarityKey"], LotItem: ["rarityKey"], Mission: ["rarityKey"],
  Series: [], UserCard: [], Discovery: [], BoosterOpening: [], GameSetting: [],
};
try {
  const local = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
  const snapshot = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
    const applied = await tx.$queryRaw<{ migration_name: string; checksum: string; finished: boolean; rolledBack: boolean }[]>`
      SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" ORDER BY started_at`;
    if (applied.some((m) => !m.finished && !m.rolledBack)) throw new Error("Une migration précédente est en échec ou en cours.");
    const finished = applied.filter((m) => m.finished && !m.rolledBack);
    for (const row of finished) {
      if (!local.includes(row.migration_name)) throw new Error(`Migration appliquée absente du dépôt : ${row.migration_name}`);
      const sql = await readFile(resolve(root,row.migration_name,"migration.sql"),"utf8");
      const variants = [sql,sql.replace(/\r\n/g,"\n"),sql.replace(/\r?\n/g,"\r\n")];
      if (!variants.some((text) => createHash("sha256").update(text).digest("hex") === row.checksum)) throw new Error(`Migration déjà appliquée dont le fichier diffère : ${row.migration_name}`);
    }
    const pending = local.filter((name) => !finished.some((m) => m.migration_name === name));
    if (after ? pending.length > 0 : pending.length !== 1 || pending[0] !== migration) throw new Error(`Migrations inattendues en attente : ${pending.join(", ") || "aucune"}`);
    if (!after) {
      const [objects] = await tx.$queryRaw<{ registry: string | null; sequence: string | null; status: string | null; sync: string | null; identity: string | null }[]>`
        SELECT to_regclass('public."RarityDefinition"')::text AS registry,to_regclass('public."Card_publicId_seq"')::text AS sequence,
        to_regtype('public."CatalogCardStatus"')::text AS status,to_regprocedure('public.catalog_sync_rarity()')::text AS sync,
        to_regprocedure('public.catalog_sync_card_identity()')::text AS identity`;
      if (Object.values(objects).some((v) => v !== null)) throw new Error("Des objets de la nouvelle migration existent déjà sans historique : vérifier avant application.");
      const triggers = await tx.$queryRaw<{ name: string }[]>`
        SELECT t.tgname::text AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public'
        AND c.relname IN ('Card','NotablePull','LotItem','Mission')`;
      if (triggers.length) throw new Error("Des triggers existants doivent être examinés avant les mises à jour de migration.");
    }
    const [rarities] = await tx.$queryRaw<{ values: string }[]>`SELECT enum_range(NULL::"Rarity")::text AS values`;
    if (rarities.values !== "{COMMON,UNCOMMON,RARE,EPIC,LEGENDARY,MYTHIC}") throw new Error("Le type historique Rarity diffère des six valeurs attendues.");
    const columns = await tx.$queryRaw<{ table_name: string; column_name: string; udt_name: string }[]>`
      SELECT table_name::text,column_name::text,udt_name::text FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('Card','NotablePull','LotItem','Mission') AND column_name IN ('rarity','rarityKey')`;
    if (columns.filter((c) => c.column_name === "rarity" && c.udt_name === "Rarity").length !== 4) throw new Error("Les colonnes de compatibilité ne sont pas toutes présentes.");
    if (columns.filter((c) => c.column_name === "rarityKey").length !== (after ? 4 : 0)) throw new Error("Schéma du catalogue inattendu : vérifier une éventuelle migration manuelle.");
    const [bounds] = await tx.$queryRaw<{ min: number; max: number; count: number }[]>`SELECT min("anilistId")::int AS min,max("anilistId")::int AS max,count(*)::int AS count FROM "Card"`;
    if (!after && (bounds.min < 1 || bounds.max >= 1_000_000_000)) throw new Error("La plage des numéros AniList nécessite une adaptation avant migration.");
    const tables: Record<string, { count: number; fingerprint: string | null }> = {};
    for (const [table, excluded] of Object.entries(additions)) {
      const [row] = await tx.$queryRaw<{ count: number; fingerprint: string | null }[]>(Prisma.sql`
        SELECT count(*)::int AS count,md5(string_agg(md5((to_jsonb(t) - ${excluded}::text[])::text),'' ORDER BY md5((to_jsonb(t) - ${excluded}::text[])::text))) AS fingerprint
        FROM ${Prisma.raw(`"${table}"`)} t`);
      tables[table] = row;
    }
    return { migration, phase: after ? "after" : "before", pending, legacyRarities: rarities.values, tables };
  }, { maxWait: 10_000, timeout: 60_000 });
  if (after) {
    const before = JSON.parse(await readFile(resolve(reportRoot,"migration-before.json"),"utf8")) as typeof snapshot;
    const changed = Object.keys(snapshot.tables).filter((table) => JSON.stringify(snapshot.tables[table]) !== JSON.stringify(before.tables[table]));
    console.log(`Comparaison des données existantes : ${changed.length ? `évolution constatée (${changed.join(", ")}), à examiner` : "empreintes et nombres de lignes identiques sur les 9 tables contrôlées"}.`);
    const definitions = await db.rarityDefinition.findMany({ select: { key: true }, orderBy: { sortOrder: "asc" } });
    if (definitions.length !== 6) throw new Error("Le registre initial ne contient pas exactement six raretés.");
    const invalid = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "Card" WHERE "publicId"<>"anilistId" OR "rarityKey"<>rarity::text OR "dropWeight"<>1`;
    if (invalid[0].count) throw new Error("Des cartes ne correspondent pas aux valeurs de migration attendues.");
    await db.card.findFirst({ select: { id: true, rarity: true, legacyRarity: true, status: true, publicId: true } });
    console.log("Client Prisma actuel et anciennes colonnes enum : lectures valides.");
  }
  await mkdir(reportRoot,{ recursive: true });
  await writeFile(resolve(reportRoot,`migration-${snapshot.phase}.json`),JSON.stringify(snapshot,null,2));
  console.log(JSON.stringify({ phase: snapshot.phase, pending: snapshot.pending, counts: Object.fromEntries(Object.entries(snapshot.tables).map(([table,v]) => [table,v.count])), legacyEnumPreserved: true }));
} catch (error) {
  console.error(String(error).replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/g,"$1***@"));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
