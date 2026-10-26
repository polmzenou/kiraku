// Ajoute au catalogue les personnages d'UNE œuvre AniList, sans toucher aux cartes existantes. Usage :
//   npm run catalog:import-media -- --media 195539 --dry-run          aperçu, rapport dans .import/, rien en base
//   npm run catalog:import-media -- --media 195539                    ajoute les persos absents (MAIN et SUPPORTING)
// Options :
//   --ids 402683,402555          seulement ces personnages (passent outre --roles et --min-favorites)
//   --rarity 402683=MYTHIC,…     rareté imposée (sinon déduite des favoris, comme si le perso était classé)
//   --draft                      cartes en brouillon : à relire puis publier dans /admin
//   --roles MAIN,SUPPORTING      rôles gardés dans l'œuvre (défaut : MAIN,SUPPORTING)
//   --min-favorites 10 · --limit 30
// Un personnage déjà présent en base (même archivé) n'est jamais modifié ni réimporté.
// PowerShell avale le « -- » : y écrire npm run catalog:import-media '--' --media 195539 (ou npx tsx scripts/import-media.mts …).
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { parseSetting, type SettingKey, type SettingValue } from "../lib/settings/defaults.ts";
import { parseIdList, parseRarityOverrides, placeNewCharacters, selectNewCharacters, type MediaRole } from "../lib/catalog/media-import.ts";
import { fetchMediaCharacters, loadCatalogCards, writeMediaCards } from "../server/catalog/media-import.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    media: { type: "string" },
    ids: { type: "string" },
    rarity: { type: "string" },
    roles: { type: "string", default: "MAIN,SUPPORTING" },
    "min-favorites": { type: "string", default: "0" },
    limit: { type: "string" },
    draft: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Une valeur sans option : npm a pris les options pour lui (« -- » avalé par PowerShell)
const swallowed = ["media", "ids", "rarity", "roles", "min_favorites", "limit", "draft", "dry_run"].filter(
  (name) => process.env[`npm_config_${name}`] !== undefined && process.env.npm_lifecycle_event === "catalog:import-media",
);
if (positionals.length > 0 || swallowed.length > 0) {
  fail("Options perdues en route (sous PowerShell, le « -- » est avalé). Utilise :\n  npm run catalog:import-media '--' --media 195539 --dry-run\nou : npx tsx scripts/import-media.mts --media 195539 --dry-run");
}

const mediaId = Number(args.media);
if (!Number.isInteger(mediaId) || mediaId <= 0) fail("--media <id AniList de l'œuvre> est obligatoire.");
const ids = parseIdList(args.ids) ?? fail("--ids : liste d'ids AniList séparés par des virgules.");
const ALL_ROLES: MediaRole[] = ["MAIN", "SUPPORTING", "BACKGROUND"];
const roles = args.roles.split(",").map((r) => r.trim().toUpperCase());
if (roles.some((r) => !ALL_ROLES.includes(r as MediaRole))) fail("--roles : MAIN, SUPPORTING et/ou BACKGROUND.");
const minFavorites = Number(args["min-favorites"]);
if (!Number.isInteger(minFavorites) || minFavorites < 0) fail("--min-favorites doit être un entier positif.");
const limit = args.limit === undefined ? null : Number(args.limit);
if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 500)) fail("--limit doit être un entier entre 1 et 500.");

const log = (message: string) => console.log(message);
const databaseUrl = process.env.DATABASE_URL ?? fail("DATABASE_URL manquante (.env.local).");
const db = new PrismaClient({ adapter: createPgAdapter(databaseUrl) });

async function main() {
  const stored = Object.fromEntries((await db.gameSetting.findMany({ select: { key: true, value: true } })).map((r) => [r.key, r.value]));
  const get = <K extends SettingKey>(key: K): SettingValue<K> => parseSetting(key, stored[key]);
  const known = (await db.rarityDefinition.findMany({ select: { key: true } })).map((r) => r.key);
  const forced = parseRarityOverrides(args.rarity, known) ?? fail(`--rarity : paires id=RARETÉ, raretés connues : ${known.join(", ")}.`);
  const unasked = [...forced.keys()].filter((id) => ids.length > 0 && !ids.includes(id));
  if (unasked.length > 0) fail(`--rarity vise des ids absents de --ids : ${unasked.join(", ")}.`);

  const fetched = await fetchMediaCharacters(mediaId, {
    requestDelayMs: get("anilist.requestDelayMs"),
    minTagRank: get("catalog.minTagRank"),
    log,
  });
  if (!fetched) fail(`Aucune œuvre AniList avec l'id ${mediaId}.`);
  log(`Œuvre : ${fetched.media.title} (${fetched.media.type ?? "?"}, id ${fetched.media.id}) · ${fetched.characters.length} personnages récupérés`);
  const ignored = Object.entries(fetched.skipped).filter(([, n]) => n > 0);
  if (ignored.length > 0) log(`  ignorés par AniList (données incomplètes) : ${ignored.map(([k, n]) => `${k} ${n}`).join(" · ")}`);

  const catalog = await loadCatalogCards(db);
  const existing = new Set(catalog.map((c) => c.anilistId).filter((id): id is number => id !== null));
  const { kept, skipped, missingIds } = selectNewCharacters(fetched.characters, existing, { ids, roles: roles as MediaRole[], minFavorites, limit });
  if (missingIds.length > 0) fail(`Ids absents de cette œuvre sur AniList : ${missingIds.join(", ")}. Rien n'a été écrit.`);

  const entries = placeNewCharacters(kept, catalog, { thresholds: get("catalog.rarityThresholds"), stats: get("catalog.stats"), forced });
  const status = args.draft ? "DRAFT" : "PUBLISHED";

  const existingSkipped = skipped.filter((s) => s.reason === "existing");
  if (existingSkipped.length > 0) log(`Déjà dans l'app, laissés tels quels : ${existingSkipped.map((s) => s.name).join(", ")}`);
  log(`\n${entries.length} à ajouter (${status === "DRAFT" ? "brouillons" : "publiées"}) :`);
  for (const e of entries) {
    log(`  ${e.character.name.padEnd(24)} ${String(e.character.favorites).padStart(6)} fav · ${e.rarity.padEnd(9)}${e.forced ? " (imposée)" : "          "} · 力${e.power} 気${e.ki} · ${e.character.series.titleRomaji}`);
  }

  if (args["dry-run"] || entries.length === 0) {
    await mkdir(".import", { recursive: true });
    const path = `.import/media-${mediaId}.json`;
    await writeFile(path, JSON.stringify({ media: fetched.media, status, entries, skipped }, null, 2));
    log(`\n${entries.length === 0 ? "Rien à ajouter." : "[dry-run] rien n'a été écrit en base."} Rapport : ${path}`);
    return;
  }

  const written = await writeMediaCards(db, entries, status);
  log(`\n${written.length} cartes ajoutées${written.length < entries.length ? ` (${entries.length - written.length} apparues entre-temps, ignorées)` : ""}.`);
  if (status === "DRAFT") log("Brouillons : à relire dans /admin (catalogue, filtre « Brouillon »), puis « Publier » pour les rendre tirables.");
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
