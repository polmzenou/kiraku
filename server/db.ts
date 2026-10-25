import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "./env";
import { createPgPool } from "./pg-adapter";

// Un seul client par processus ; en dev, survit au rechargement à chaud. On garde aussi la classe
// qui l'a créé : après un `prisma generate` (nouveau modèle), la classe change et le client est
// recréé, sinon l'ancien n'aurait pas les nouveaux délégués (ex. prisma.adminLog undefined).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient };

function createClient() {
  const pool = createPgPool(env.DATABASE_URL);
  // Fluid compute : l'instance reste en vie le temps de fermer les connexions inactives,
  // au lieu de les laisser ouvertes côté Supabase quand elle se met en veille.
  if (isProduction) attachDatabasePool(pool);
  // disposeExternalPool : en dev, le client remplacé après un `prisma generate` ferme son pool.
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
}

function sharedClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && globalForPrisma.prismaClass === PrismaClient) return cached;
  if (cached) void cached.$disconnect().catch(() => undefined);
  return createClient();
}

export const prisma = isProduction ? createClient() : sharedClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}
