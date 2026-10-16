// Précontrôle sans affichage de secrets, avant toute migration ou construction Vercel.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const env = process.env;
const target = env.VERCEL_ENV ?? "local";
const production = target === "production" || process.argv.includes("--production");
const errors = [];
const warnings = [];
const present = (key) => Boolean(env[key]?.trim());
const requireKeys = (keys) => keys.forEach((key) => { if (!present(key)) errors.push(`${key} manquante`); });
const url = (key, protocols) => {
  if (!present(key)) return null;
  try {
    const value = new URL(env[key]);
    if (!protocols.includes(value.protocol)) throw new Error();
    return value;
  } catch { errors.push(`${key} invalide`); return null; }
};
const group = (keys) => { if (keys.some(present)) requireKeys(keys); };

requireKeys(["DATABASE_URL", "AUTH_SECRET"]);
if (present("AUTH_SECRET") && env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET : 32 caractères minimum");
const db = url("DATABASE_URL", ["postgres:", "postgresql:"]);
const directKey = ["DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"].find(present);
const direct = directKey ? url(directKey, ["postgres:", "postgresql:"]) : null;
const databaseIdentity = (value) => `${value.hostname.replace("-pooler.", ".")}:${value.port || "5432"}${value.pathname}`;
if (db && direct && databaseIdentity(db) !== databaseIdentity(direct)) errors.push("DATABASE_URL et l'URL directe visent des bases différentes");
const test = url("DATABASE_URL_TEST", ["postgres:", "postgresql:"]);
if (db && test && databaseIdentity(db) === databaseIdentity(test)) errors.push("DATABASE_URL_TEST doit viser une branche isolée, jamais la base de l'application");
if (!test) warnings.push("DATABASE_URL_TEST absente : tests d'intégration à exécuter sur une branche Neon isolée avant lancement");

group(["AUTH_DISCORD_ID", "AUTH_DISCORD_SECRET"]);
group(["DISCORD_BOT_TOKEN", "DISCORD_LINK_CHANNEL_ID"]);
if (present("DISCORD_LINK_CHANNEL_ID") && !/^[0-9]{17,20}$/.test(env.DISCORD_LINK_CHANNEL_ID)) errors.push("DISCORD_LINK_CHANNEL_ID invalide");
group(["RESEND_API_KEY", "MAIL_FROM"]);
group(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
env.UPSTASH_REDIS_REST_URL ||= env.KV_REST_API_URL;
env.UPSTASH_REDIS_REST_TOKEN ||= env.KV_REST_API_TOKEN;
group(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
url("UPSTASH_REDIS_REST_URL", ["https:"]);
const app = url("APP_URL", production ? ["https:"] : ["http:", "https:"]);
if (app && (app.pathname !== "/" || app.search || app.hash || app.username || app.password)) errors.push("APP_URL doit être une origine, sans chemin ni identifiants");
if (present("CRON_SECRET") && env.CRON_SECRET.length < 16) errors.push("CRON_SECRET : 16 caractères minimum");
if (present("ABLY_API_KEY") && !/^[^.:\s]+\.[^.:\s]+:\S+$/.test(env.ABLY_API_KEY)) errors.push("ABLY_API_KEY invalide");
if (present("VAPID_PUBLIC_KEY") && !/^[A-Za-z0-9_-]{80,100}$/.test(env.VAPID_PUBLIC_KEY)) errors.push("VAPID_PUBLIC_KEY invalide");
if (present("VAPID_PRIVATE_KEY") && !/^[A-Za-z0-9_-]{40,50}$/.test(env.VAPID_PRIVATE_KEY)) errors.push("VAPID_PRIVATE_KEY invalide");
if (present("VAPID_SUBJECT") && !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT)) errors.push("VAPID_SUBJECT invalide");
if (production) {
  requireKeys(["APP_URL", "CRON_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
  for (const key of ["AUTH_DISCORD_ID", "ADMIN_DISCORD_ID", "RESEND_API_KEY", "ABLY_API_KEY", "VAPID_PUBLIC_KEY"]) {
    if (!present(key)) warnings.push(`${key} absente : vérifier le service correspondant dans la checklist`);
  }
}
for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const error of errors) console.error(`✖ ${error}`);
if (errors.length) process.exit(1);
console.log(`Environnement ${production ? "production" : target} valide (valeurs secrètes masquées).`);
