// Bascule vers le parrainage v2, au lancement (idempotente) : parrainages v1 en attente convertis, empreintes des
// filleuls existants gardées. À lancer une fois après npm run seed:referral, avant d'allumer referral.v2.enabled.
// Usage : npm run referral:switch
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";
import { fingerprintKey } from "../server/referral/fingerprint.ts";
import { switchToReferralV2With } from "../server/referral/switch-core.ts";

config({ path: [".env.local", ".env"], quiet: true });
const connectionString = process.env.DATABASE_URL;
const secret = process.env.AUTH_SECRET;
if (!connectionString) throw new Error("DATABASE_URL manquante");
if (!secret || secret.length < 32) throw new Error("AUTH_SECRET manquant");
const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
try {
  const done = await switchToReferralV2With(prisma, { key: fingerprintKey(secret) });
  console.log(`Parrainage v2 : ${done.converted} parrainages en attente convertis, ${done.fingerprinted} filleuls avec empreinte.`);
} finally {
  await prisma.$disconnect();
}
