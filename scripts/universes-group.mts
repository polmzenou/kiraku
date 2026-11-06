// Regroupe les séries du catalogue en univers d'après les relations AniList. Usage :
//   npm run catalog:universes                  aperçu : rapport dans .import/universes.json, rien en base
//   npm run catalog:universes -- --apply       écrit les nouveaux univers et les rattachements
// Ne traite que les séries sans univers et ne déplace jamais une série déjà rangée : les corrections
// faites dans /admin/univers survivent aux relances.
// PowerShell avale le « -- » : y écrire npm run catalog:universes '--' --apply (ou npx tsx scripts/universes-group.mts --apply).
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { parseSetting } from "../lib/settings/defaults.ts";
import { planUniverses, type UniverseSeries } from "../lib/catalog/universes.ts";
import { applyUniversePlan, fetchMediaRelations } from "../server/catalog/universes-core.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { apply: { type: "boolean", default: false } } });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Une valeur sans option : npm a pris --apply pour lui (« -- » avalé par PowerShell), et on écrirait un simple aperçu sans le dire
if (positionals.length > 0 || (process.env.npm_config_apply !== undefined && process.env.npm_lifecycle_event === "catalog:universes")) {
  fail("Options perdues en route (sous PowerShell, le « -- » est avalé). Utilise :\n  npm run catalog:universes '--' --apply\nou : npx tsx scripts/universes-group.mts --apply");
}

const REPORT = ".import/universes.json";
const log = (message: string) => console.log(message);
const databaseUrl = process.env.DATABASE_URL ?? fail("DATABASE_URL manquante (.env.local).");
const db = new PrismaClient({ adapter: createPgAdapter(databaseUrl) });

const titles = (series: readonly UniverseSeries[]) => series.map((s) => s.titleRomaji).join(" · ");

async function main() {
  const stored = await db.gameSetting.findUnique({ where: { key: "anilist.requestDelayMs" }, select: { value: true } });
  const series: UniverseSeries[] = await db.series.findMany({ orderBy: { titleRomaji: "asc" }, select: { id: true, anilistId: true, titleRomaji: true, universeId: true } });
  const anilistIds = series.flatMap((s) => s.anilistId ?? []);
  log(`${series.length} séries, dont ${series.filter((s) => s.universeId === null).length} sans univers. Lecture des relations AniList…`);

  const { edges, missing } = await fetchMediaRelations(anilistIds, { requestDelayMs: parseSetting("anilist.requestDelayMs", stored?.value), log });
  const plan = planUniverses(series, edges);

  log(`\n${plan.create.length} univers à créer, ${plan.join.length} rattachements à un univers existant :`);
  for (const group of plan.create) log(`  + ${group.name} (${group.series.length}) : ${titles(group.series)}`);
  for (const group of plan.join) log(`  → univers ${group.universeId} : ${titles(group.series)}`);
  if (plan.conflicts.length > 0) {
    log(`\n${plan.conflicts.length} groupes reliés à plusieurs univers, laissés tels quels (à trancher dans /admin/univers) :`);
    for (const group of plan.conflicts) log(`  ? ${group.universeIds.join(", ")} : ${titles(group.series)}`);
  }
  if (plan.withoutAnilist.length > 0) log(`\n${plan.withoutAnilist.length} séries sans id AniList (cartes créées à la main), à ranger dans /admin/univers : ${titles(plan.withoutAnilist)}`);
  if (missing.length > 0) log(`\n${missing.length} œuvres absentes de la réponse d'AniList, ignorées : ${missing.join(", ")}`);

  await mkdir(".import", { recursive: true });
  await writeFile(REPORT, JSON.stringify({ applied: args.apply, ...plan, missing }, null, 2));
  log(`\nRapport : ${REPORT}`);

  if (!args.apply) {
    log("Aperçu : rien n'a été écrit en base. Relis le rapport, puis relance avec --apply.");
    return;
  }
  const { created, moved } = await applyUniversePlan(db, plan);
  log(`${created} univers créés, ${moved} séries rangées.`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await db.$disconnect();
    process.exit(1);
  });
