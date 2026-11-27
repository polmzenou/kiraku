import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "./env";
import { createPgPool } from "./pg-adapter";

// Un client par environnement de Next (pages, routes d'API : deux par processus, voir server/pg-adapter.ts) ;
// en dev, survit au rechargement à chaud. On garde aussi la classe
// qui l'a créé : après un `prisma generate` (nouveau modèle), la classe change et le client est
// recréé, sinon l'ancien n'aurait pas les nouveaux délégués (ex. prisma.adminLog undefined).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient };

function createClient() {
  // Processus pm2 permanent sur le VPS : le pool ferme lui-même ses connexions inactives (server/pg-adapter.ts)
  const pool = createPgPool(env.DATABASE_URL);
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
