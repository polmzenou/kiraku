// Parrainage v2 : ajoute seulement les lots et les réglages manquants ; les valeurs éditées dans l'admin sont conservées.
// Usage : npm run seed:referral
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertReferralV2Seeds } from "../prisma/seed/referral-v2.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL manquante");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
try {
  const created = await upsertReferralV2Seeds(prisma);
  console.log(`Parrainage v2 : ${created.lots} lots et ${created.settings} réglages créés.`);
} finally {
  await prisma.$disconnect();
}
