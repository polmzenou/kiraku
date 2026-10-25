// Simulation des tirages comparée aux probabilités exactes (preuve des taux). Usage :
//   npm run sim:boosters                               1 000 000 boosters, réglages par défaut
//   npm run sim:boosters -- --n 5000000 --seed 7       plus de boosters, autre graine
//   npm run sim:boosters -- --from-db                  réglages actuels de l'admin (GameSetting)
//   npm run sim:boosters -- --type all                 composition de chaque type de départ (34 boosters)
//   npm run sim:boosters -- --type jubako --n 500000   un seul type
// Sous PowerShell, le « -- » est avalé : npx tsx scripts/simulate-boosters.mts --from-db
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import type { DrawRules } from "../lib/boosters/draw.ts";
import { DEFAULT_RULES, fakePool } from "../lib/boosters/fixtures.ts";
import { effectiveSlotFloors } from "../lib/boosters/types.ts";
import { BOOSTER_SEEDS } from "../prisma/seed/booster-types.ts";
import { boosterChances, mythicsPerDay, slotDistribution } from "../lib/boosters/odds.ts";
import { seededRng } from "../lib/boosters/rng.ts";
import { CHI2_CRITICAL_001, chiSquare, compareToOdds, simulate, type Check } from "../lib/boosters/simulation.ts";
import { parseSetting, type SettingKey } from "../lib/settings/defaults.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values: args } = parseArgs({
  options: {
    n: { type: "string", default: "1000000" },
    seed: { type: "string", default: String(Date.now() % 2 ** 31) },
    "from-db": { type: "boolean", default: false },
    type: { type: "string" },
  },
});

const n = Number(args.n);
const seed = Number(args.seed);
if (!Number.isInteger(n) || n < 1000 || n > 100_000_000 || !Number.isInteger(seed)) {
  console.error("--n entre 1 000 et 100 000 000, --seed entier.");
  process.exit(1);
}

async function rulesFromDb(): Promise<{ rules: DrawRules; intervalMinutes: number }> {
  const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL!) });
  try {
    const rows = await prisma.gameSetting.findMany({ select: { key: true, value: true } });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const get = <K extends SettingKey>(k: K) => parseSetting(k, stored.get(k));
    return {
      rules: {
        rates: get("booster.rates"),
        slotFloors: get("booster.slotFloors"),
        pityThreshold: get("booster.pityThreshold"),
        goldenEvery: get("booster.goldenEvery"),
        goldenFloor: get("booster.goldenFloor"),
        divineOdds: get("booster.divineOdds"),
      },
      intervalMinutes: get("booster.intervalMinutes"),
    };
  } finally {
    await prisma.$disconnect();
  }
}

const { rules, intervalMinutes } = args["from-db"] ? await rulesFromDb() : { rules: DEFAULT_RULES, intervalMinutes: 10 };
const pool = fakePool();
const fmt = (x: number, digits = 1) => x.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function printChecks(checks: Check[]) {
  console.log("  " + "contrôle".padEnd(58) + "attendu".padStart(12) + "observé".padStart(12) + "écart".padStart(10));
  for (const c of checks) {
    const flag = Math.abs(c.sigma) < 5 ? "  " : " ✗";
    console.log(
      "  " + c.label.padEnd(58) + fmt(c.expected).padStart(12) + String(c.observed).padStart(12) + `${fmt(c.sigma, 2)} σ`.padStart(10) + flag,
    );
  }
}

if (args.type) {
  // Composition de chaque type (sans bonus) : planchers du seed, réglages globaux pour le reste
  const seeds = args.type === "all" ? BOOSTER_SEEDS : BOOSTER_SEEDS.filter((s) => s.slug === args.type);
  if (seeds.length === 0) {
    console.error(`Type inconnu : ${args.type}. Slugs : ${BOOSTER_SEEDS.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }
  const seen = new Set<string>();
  let failures = 0;
  for (const def of seeds) {
    const floors = effectiveSlotFloors(def.slotFloors ?? [], rules.slotFloors);
    const key = floors.join(",");
    const sameAs = seen.has(key);
    seen.add(key);
    if (sameAs && args.type === "all") continue; // même composition qu'un type déjà simulé
    const typeRules: DrawRules = { ...rules, slotFloors: floors, goldenEvery: 0, divineOdds: 0, pityThreshold: Number.MAX_SAFE_INTEGER };
    const counts = simulate(seededRng(seed), typeRules, pool, n, { golden: false, divine: false, pity: false });
    const checks = compareToOdds(counts, typeRules).filter((c) => !c.label.startsWith("boosters avec"));
    failures += checks.filter((c) => Math.abs(c.sigma) >= 5).length;
    console.log(`\n${def.slug} (${floors.length} cartes : ${floors.map((f) => f[0]).join(" · ")})`);
    printChecks(checks);
  }
  const others = BOOSTER_SEEDS.filter((s) => !s.slotFloors).map((s) => s.slug);
  if (args.type === "all") console.log(`\nMême composition que standard : ${others.filter((s) => s !== "standard").join(", ")}`);
  console.log(failures === 0 ? "\nAucun écart ≥ 5 σ." : `\n${failures} écart(s) ≥ 5 σ.`);
  process.exit(failures === 0 ? 0 : 1);
}

console.log(`Simulation de ${n.toLocaleString("fr-FR")} boosters, graine ${seed}${args["from-db"] ? " (réglages de la base)" : " (réglages par défaut)"}\n`);

// 1. Composition seule : pas de pitié, de doré ni de divin, chaque emplacement suit les parts
const plain: DrawRules = { ...rules, goldenEvery: 0, divineOdds: 0, pityThreshold: 10_000 };
let t = performance.now();
const composition = simulate(seededRng(seed), plain, pool, n);
console.log(`1. Composition seule (${fmt((performance.now() - t) / 1000, 2)} s)`);
printChecks(compareToOdds(composition, plain).filter((c) => !c.label.startsWith("boosters avec")));
plain.slotFloors.forEach((floor, slot) => {
  const { stat, df } = chiSquare(composition.perSlot[slot], slotDistribution(plain.rates, floor), composition.normalBoosters);
  const critical = CHI2_CRITICAL_001[df];
  console.log(`  χ² emplacement ${slot + 1} (${floor}+) : ${fmt(stat, 2)} pour ${df} ddl, seuil p = 0,001 : ${critical}${stat < critical ? "" : " ✗"}`);
});

// 2. Séquence complète d'un joueur : pitié, doré, divin
t = performance.now();
const full = simulate(seededRng(seed + 1), rules, pool, n);
console.log(`\n2. Séquence complète (${fmt((performance.now() - t) / 1000, 2)} s)`);
printChecks(compareToOdds(full, rules).filter((c) => c.label.startsWith("boosters ")));
console.log(`  plus longue série sans Mythique : ${full.longestDrought} (pitié à ${rules.pityThreshold})`);
console.log(`  boosters dorés : ${full.golden}, mal placés : ${full.goldenMisplaced}, sous le plancher : ${full.goldenBelowFloor}`);
console.log(`  pitié déclenchée : ${full.pityTriggered} fois`);

const chances = boosterChances(rules);
const perDay = mythicsPerDay(chances.mythicRate, intervalMinutes);
console.log(
  `\nÉcart moyen entre deux Mythiques : ${fmt(chances.meanGap)} boosters (observé ${fmt(n / full.mythicBoosters)}), ` +
    `soit ${fmt(perDay, 2)} Mythique par jour à ${fmt((24 * 60) / intervalMinutes, 0)} boosters gratuits.`,
);
