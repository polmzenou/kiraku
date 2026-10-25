import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "./env";
import { createPgAdapter } from "./pg-adapter";

// Un seul client par processus ; en dev, survit au rechargement à chaud. On garde aussi la classe
// qui l'a créé : après un `prisma generate` (nouveau modèle), la classe change et le client est
// recréé, sinon l'ancien n'aurait pas les nouveaux délégués (ex. prisma.adminLog undefined).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient };

function createClient() {
  return new PrismaClient({ adapter: createPgAdapter(env.DATABASE_URL) });
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
