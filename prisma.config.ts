import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // URL directe (sans pooler) : réservée aux migrations.
    // DATABASE_URL_UNPOOLED : nom posé par l'intégration Neon de Vercel.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? "",
  },
});
