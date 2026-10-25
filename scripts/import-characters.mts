// Import du catalogue depuis AniList (étape 2). Usage :
//   npm run catalog:import                        import complet (catalog.size personnages)
//   npm run catalog:import -- --limit 200         import limité (essais)
//   npm run catalog:import -- --limit 200 --dry-run   aucune écriture en base, rapport dans .import/
//   npm run catalog:import -- --fresh             repart de zéro au lieu de reprendre
//   npm run catalog:import -- --finalize-only     reclasse le dernier staging sans appeler AniList
//   npm run catalog:import -- --rarity live       ignore catalog.rarityPolicy pour cette exécution
//     (ex. après un essai sur 200 personnages : leurs raretés « figées » n'ont pas de sens sur 6 736)
// Interrompu (Ctrl+C, coupure réseau, limite AniList) : relancer la même commande reprend où il s'était arrêté.
// PowerShell avale le « -- » : y écrire npm run catalog:import '--' --limit 200 (ou npm.cmd run …).
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { parseSetting, type SettingKey, type SettingValue } from "../lib/settings/defaults.ts";
import { finalizeRun, runImport, type FinalizeReport, type ImportSettings } from "../server/catalog/import.ts";
import { memoryImportStore } from "../server/catalog/memory-store.ts";
import { prismaImportStore } from "../server/catalog/prisma-store.ts";
import { filterContext } from "../lib/boosters/pool-filter.ts";
import { recomputeBoosterPools } from "../server/boosters/type-store.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    fresh: { type: "boolean", default: false },
    "finalize-only": { type: "boolean", default: false },
    rarity: { type: "string" },
    "preserve-existing": { type: "boolean", default: false },
    "stage-only": { type: "boolean", default: false },
  },
});

// Une valeur sans option (« live », « 200 ») : npm a pris les options pour lui, le « -- » a disparu.
// On s'arrête plutôt que de lancer un import complet par erreur.
// Une option avalée seule (« --fresh ») laisse une trace npm_config_fresh dans l'environnement.
const swallowed = ["limit", "fresh", "finalize_only", "rarity", "dry_run", "preserve_existing", "stage_only"].filter(
  (name) => process.env[`npm_config_${name}`] !== undefined && process.env.npm_lifecycle_event === "catalog:import",
);
if (positionals.length > 0 || swallowed.length > 0) {
  console.error(
    `Options perdues (${[...positionals, ...swallowed.map((s) => `--${s.replace("_", "-")}`)].join(" ")}) : elles n'ont pas atteint le script ` +
      "(sous PowerShell, le « -- » est avalé). Utilise :\n" +
      "  npm run catalog:import '--' --finalize-only --rarity live\n" +
      "ou directement : npx tsx scripts/import-characters.mts --finalize-only --rarity live",
  );
  process.exit(1);
}

const limit = args.limit === undefined ? null : Number(args.limit);
if (limit !== null && (!Number.isInteger(limit) || limit < 10 || limit > 50_000)) {
  console.error("--limit doit être un entier entre 10 et 50 000.");
  process.exit(1);
}

if (args.rarity !== undefined && args.rarity !== "live" && args.rarity !== "frozen") {
  console.error("--rarity doit valoir live ou frozen.");
  process.exit(1);
}

if (args["finalize-only"] && (args["dry-run"] || args["stage-only"])) {
  throw new Error("--finalize-only ne peut pas être combiné avec --dry-run ou --stage-only.");
}
if (args["preserve-existing"] && args.rarity === "live") {
  throw new Error("--preserve-existing conserve les raretés : --rarity live est incompatible.");
}

const log = (message: string) => console.log(message);
const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? new PrismaClient({ adapter: createPgAdapter(databaseUrl) }) : null;

// Réglages lus directement dans GameSetting (unstable_cache n'existe pas hors de Next)
async function loadSettings() {
  let stored: Record<string, unknown> = {};
  if (db) {
    try {
      const rows = await db.gameSetting.findMany({ select: { key: true, value: true } });
      stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    } catch {
      if (!args["dry-run"] || args["preserve-existing"]) throw new Error("Lecture de GameSetting impossible : la base est-elle migrée ?");
      log("GameSetting illisible : valeurs par défaut utilisées pour le dry-run.");
    }
  }
  const get = <K extends SettingKey>(key: K): SettingValue<K> => parseSetting(key, stored[key]);
  const settings: ImportSettings = {
    perPage: get("anilist.perPage"),
    requestDelayMs: get("anilist.requestDelayMs"),
    minTagRank: get("catalog.minTagRank"),
    thresholds: get("catalog.rarityThresholds"),
    stats: get("catalog.stats"),
    policy: args["preserve-existing"] ? "FROZEN" : args.rarity === undefined ? get("catalog.rarityPolicy") : args.rarity === "live" ? "LIVE" : "FROZEN",
    preserveExisting: args["preserve-existing"],
  };
  return { settings, size: get("catalog.size") };
}

function printReport(report: FinalizeReport) {
  log("");
  log(`Catalogue : ${report.total} cartes`);
  log(`  insérées ${report.inserted} · rang changé ${report.rankChanged} · rareté changée ${report.rarityChanged} · sorties ${report.removed}`);
  log(`  répartition : ${Object.entries(report.byRarity).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  log("  top 10 :");
  for (const c of report.top) log(`    #${String(c.rank).padStart(4, "0")} ${c.name} (${c.anilistId}) ${c.rarity}`);
}

/** Après une finalisation, les pools des types de boosters suivent le nouveau catalogue. */
async function recomputePools() {
  if (!db) return;
  const tz = await db.gameSetting.findUnique({ where: { key: "game.timeZone" }, select: { value: true } });
  const reports = await recomputeBoosterPools(db, filterContext(new Date(), parseSetting("game.timeZone", tz?.value)));
  log(`Pools des boosters recalculés : ${reports.length} types.`);
}

async function main() {
  if (!db && !args["dry-run"]) throw new Error("DATABASE_URL manquante (.env.local).");
  if (!db && args["preserve-existing"]) throw new Error("--preserve-existing a besoin de la base pour protéger le catalogue existant.");
  const { settings, size } = await loadSettings();
  const target = limit ?? size;

  if (args["finalize-only"]) {
    if (!db) throw new Error("--finalize-only a besoin de la base.");
    const store = prismaImportStore(db);
    const run = await store.latestRun();
    if (!run) throw new Error("Aucun import à finaliser.");
    if (limit !== null && run.target !== limit) throw new Error(`Le dernier import vise ${run.target} personnages, pas ${limit}.`);
    log(`Finalisation de l'import ${run.id} (${run.kept} personnages en staging, objectif ${run.target}, raretés ${settings.policy})`);
    const { report } = await finalizeRun(store, run, settings);
    printReport(report);
    await recomputePools();
    return 0;
  }

  let stopRequested = false;
  process.on("SIGINT", () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    log("\nArrêt après la page en cours (Ctrl+C à nouveau pour couper tout de suite).");
  });

  const dryRun = args["dry-run"];
  const snapshot = dryRun && db ? await prismaImportStore(db).catalogSnapshot() : [];
  const store = dryRun ? memoryImportStore(snapshot) : prismaImportStore(db!);
  log(`${dryRun ? "[dry-run] " : ""}Objectif ${target} personnages, ${settings.perPage} par page, ${settings.requestDelayMs} ms entre les pages, raretés ${settings.policy}`);

  const result = await runImport({
    store,
    settings,
    target,
    fresh: args.fresh,
    stageOnly: args["stage-only"],
    log,
    shouldStop: () => stopRequested,
  });

  if (result.status !== "finalized" && result.status !== "staged") return result.status === "interrupted" ? 130 : 1;

  log(`\n${result.pagesFetched} pages récupérées ; ignorés : ${Object.entries(result.skipped).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  printReport(result.report);

  if (dryRun || result.status === "staged") {
    await mkdir(".import", { recursive: true });
    const rows = result.entries.map((e) => ({
      rank: e.rank,
      anilistId: e.anilistId,
      name: e.data.name,
      nameNative: e.data.nameNative,
      series: e.data.series.titleRomaji,
      favorites: e.favorites,
      rarity: e.rarity,
      power: e.power,
      ki: e.ki,
    }));
    const reportPath = dryRun ? ".import/dry-run.json" : ".import/staged-preview.json";
    await writeFile(reportPath, JSON.stringify({ runId: result.runId, report: result.report, cards: rows }, null, 2));
    log(`\nRapport détaillé : ${reportPath} (${dryRun ? "rien n'a été écrit en base" : "staging enregistré, catalogue inchangé"})`);
  } else {
    await recomputePools();
  }
  return 0;
}

main()
  .then(async (code) => {
    await db?.$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await db?.$disconnect();
    process.exit(1);
  });
