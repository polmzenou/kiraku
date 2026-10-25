// Ajoute seulement les missions et leurs lots manquants ; les valeurs éditées dans l'admin sont conservées.
// Usage : npm run seed:missions
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertMissionSeeds } from "../prisma/seed/economy.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL manquante");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
try {
  const created = await upsertMissionSeeds(prisma);
  console.log(`Missions : ${created.missions} objectifs et ${created.lots} lots créés.`);
} finally {
  await prisma.$disconnect();
}
