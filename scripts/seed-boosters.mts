// Charge les 34 boosters de départ (prisma/seed/booster-types.ts) puis recalcule leurs pools. Usage :
//   npm run seed:boosters              crée les types manquants, garde ceux déjà réglés dans l'admin
//   npm run seed:boosters -- --force   réécrit aussi les types existants avec les valeurs de départ
//   npm run seed:boosters -- --pools   recalcule seulement les pools (après un changement de catalogue)
// Sous PowerShell, le « -- » est avalé : npx tsx scripts/seed-boosters.mts --force
import { parseArgs } from "node:util";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { filterContext } from "../lib/boosters/pool-filter.ts";
import { parseSetting } from "../lib/settings/defaults.ts";
import { BOOSTER_SEEDS } from "../prisma/seed/booster-types.ts";
import { recomputeBoosterPools, upsertBoosterSeeds } from "../server/boosters/type-store.ts";

config({ path: [".env.local", ".env"], quiet: true });

const { values: args } = parseArgs({
  options: { force: { type: "boolean", default: false }, pools: { type: "boolean", default: false } },
});

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

try {
  if (!args.pools) {
    const r = await upsertBoosterSeeds(prisma, BOOSTER_SEEDS, { force: args.force });
    console.log(`Types créés : ${r.created.length}, réécrits : ${r.updated.length}, gardés : ${r.kept.length}`);
  }
  const tz = await prisma.gameSetting.findUnique({ where: { key: "game.timeZone" }, select: { value: true } });
  const reports = await recomputeBoosterPools(prisma, filterContext(new Date(), parseSetting("game.timeZone", tz?.value)));
  console.log("\nPools recalculés :");
  for (const r of reports.sort((a, b) => b.size - a.size)) {
    const detail = Object.entries(r.counts)
      .map(([rarity, n]) => `${rarity[0]} ${n}`)
      .join(" · ");
    console.log(`  ${r.slug.padEnd(18)} ${String(r.size).padStart(5)}   ${detail}`);
  }
} finally {
  await prisma.$disconnect();
}
