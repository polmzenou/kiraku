import "server-only";
import { deploymentEnv, resolveAppUrl } from "@/lib/deployment";
import { z } from "@/lib/zod";

const schema = z.object({
  DATABASE_URL: z.url(), // URL poolée (Supabase : pooler en mode transaction, port 6543), utilisée à l'exécution
  AUTH_SECRET: z.string().min(32),
  // Discord en attente : sans ces deux variables, la liaison est simplement masquée
  AUTH_DISCORD_ID: z.string().min(1).optional(),
  AUTH_DISCORD_SECRET: z.string().min(1).optional(),
  // Annonce de première liaison dans un salon Discord (facultatif, côté serveur seulement).
  DISCORD_BOT_TOKEN: z.string().trim().min(1).optional(),
  DISCORD_LINK_CHANNEL_ID: z.string().regex(/^[0-9]{17,20}$/).optional(),
  ADMIN_DISCORD_ID: z.string().optional(),
  // E-mails (Resend) en attente : sans clé, les liens sont écrits dans les logs en dev
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(), // ex. « Kiraku <noreply@kiraku.app> »
  APP_URL: z.url().optional(), // origine publique (liens, images de partage, sitemap) : obligatoire en production
  // Hors Vercel : « preview » pour une préproduction (robots refusés), sinon déduit de NODE_ENV
  APP_ENV: z.enum(["production", "preview", "development"]).optional(),
  // Web Push : paire VAPID (`npx web-push generate-vapid-keys`). La clé publique est transmise
  // au navigateur par la page /compte ; la clé privée ne quitte jamais le serveur.
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/).optional(),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/).optional(),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/).optional(), // contact pour les services push
  // Ably (temps réel du combat) : clé « appId.keyId:secret », jamais transmise au navigateur. Sans
  // elle, le plateau sonde la partie toutes les battle.pollSeconds.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  BLOB_PUBLIC_HOST: z.string().regex(/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/).optional(),
  ABLY_API_KEY: z.string().regex(/^[^.:\s]+\.[^.:\s]+:\S+$/).optional(),
  // Vercel Cron (clôture des ventes) : envoyé par Vercel en « Authorization: Bearer … »
  CRON_SECRET: z.string().min(16).optional(),
});

// Une variable vide (ex. copiée telle quelle de .env.example) compte comme absente
const raw: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ""),
);
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // Noms des variables seulement, jamais leurs valeurs
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Variables d'environnement invalides : ${missing}`);
}

export const deployment = deploymentEnv(raw);

if (deployment === "production" && !parsed.data.CRON_SECRET) {
  // Sans lui, la clôture planifiée des ventes refuserait chaque appel du cron
  throw new Error("CRON_SECRET est obligatoire en production (clôture des ventes).");
}

// Calculée une fois au démarrage : en production, pas de repli silencieux sur localhost
const resolvedUrl = resolveAppUrl(raw, deployment);
if (!resolvedUrl) {
  throw new Error("APP_URL est obligatoire en production (ex. https://kiraku-kun.com) : liens, aperçus et sitemap en dépendent.");
}
const publicUrl: string = resolvedUrl;

export const env = parsed.data;
export const isProduction = process.env.NODE_ENV === "production";

export const discordEnabled = Boolean(env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET);
export const discordLinkConfigured = Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_LINK_CHANNEL_ID);
export const mailEnabled = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
export const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
export const ablyEnabled = Boolean(env.ABLY_API_KEY);

/** Origine publique du site : jamais déduite de l'en-tête Host (empoisonnement des liens). */
export function appUrl(): string {
  return publicUrl;
}
