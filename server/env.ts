import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(), // URL poolée Neon (-pooler), utilisée à l'exécution
  AUTH_SECRET: z.string().min(32),
  // Discord en attente : sans ces deux variables, la liaison est simplement masquée
  AUTH_DISCORD_ID: z.string().min(1).optional(),
  AUTH_DISCORD_SECRET: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  ADMIN_DISCORD_ID: z.string().optional(),
  // E-mails (Resend) en attente : sans clé, les liens sont écrits dans les logs en dev
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(), // ex. « Kiraku <noreply@kiraku.app> »
  APP_URL: z.url().optional(), // origine publique, pour les liens des e-mails
});

// Une variable vide (ex. copiée telle quelle de .env.example) compte comme absente
const raw: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ""),
);
// L'intégration Upstash de Vercel pose KV_REST_API_URL / KV_REST_API_TOKEN : même chose.
raw.UPSTASH_REDIS_REST_URL ??= raw.KV_REST_API_URL;
raw.UPSTASH_REDIS_REST_TOKEN ??= raw.KV_REST_API_TOKEN;
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // Noms des variables seulement, jamais leurs valeurs
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Variables d'environnement invalides : ${missing}`);
}

if (
  process.env.VERCEL_ENV === "production" &&
  !(parsed.data.UPSTASH_REDIS_REST_URL && parsed.data.UPSTASH_REDIS_REST_TOKEN)
) {
  throw new Error("Upstash est obligatoire en production (UPSTASH_REDIS_REST_* ou KV_REST_API_*).");
}

export const env = parsed.data;
export const isProduction = process.env.NODE_ENV === "production";

export const discordEnabled = Boolean(env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET);
export const mailEnabled = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

/** Origine publique du site : jamais déduite de l'en-tête Host (empoisonnement des liens). */
export function appUrl(): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  // Preview : URL stable de la branche, pour que les liens visent la même base que la preview
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
