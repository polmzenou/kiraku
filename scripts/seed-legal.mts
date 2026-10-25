// Publie la version 1 des pages légales (prisma/seed/legal/*.md) pour les slugs qui n'en ont aucune.
// Idempotent, lancé à chaque déploiement (vercel-build) ; ensuite tout se fait dans /admin/legal.
//   npm run seed:legal
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertLegalSeeds } from "../prisma/seed/legal.ts";
import { createPgAdapter } from "../server/pg-adapter.ts";

config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL!) });

try {
  const created = await upsertLegalSeeds(prisma);
  console.log(created.length ? `Pages légales publiées (v1) : ${created.join(", ")}` : "Pages légales : rien à créer");
} finally {
  await prisma.$disconnect();
}
