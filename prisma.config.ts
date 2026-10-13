import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * URL directe (sans pooler) pour les migrations. Noms acceptés : DIRECT_URL,
 * DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING (intégration Neon de Vercel),
 * sinon dérivée de DATABASE_URL (chez Neon, l'hôte direct = l'hôte poolé sans « -pooler »).
 */
function migrationUrl(): string {
  const env = process.env;
  const direct = env.DIRECT_URL || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING;
  if (direct) return direct;
  if (!env.DATABASE_URL) return "";
  try {
    const url = new URL(env.DATABASE_URL);
    url.hostname = url.hostname.replace("-pooler.", ".");
    return url.toString();
  } catch {
    return "";
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl(),
  },
});
