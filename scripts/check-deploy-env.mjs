// Précontrôle sans affichage de secrets, avant toute migration ou construction (VPS ou Vercel).
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const env = process.env;
// Même ordre que lib/deployment.ts : APP_ENV (VPS), puis VERCEL_ENV, puis NODE_ENV
const target = env.APP_ENV || env.VERCEL_ENV || (env.NODE_ENV === "production" ? "production" : "local");
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
// Chez Supabase, le projet se lit dans l'utilisateur du pooler (postgres.<ref>, ports 6543 et 5432)
// ou dans l'hôte direct (db.<ref>.supabase.co) ; ailleurs, hôte et port (Neon : sans « -pooler »).
const databaseIdentity = (value) => {
  const pooler = value.hostname.endsWith(".pooler.supabase.com") && /^[^.]+\.([a-z0-9]+)$/.exec(decodeURIComponent(value.username));
  const supabase = pooler?.[1] ?? /^db\.([a-z0-9]+)\.supabase\.co$/.exec(value.hostname)?.[1];
  if (supabase) return `supabase:${supabase}${value.pathname}`;
  return `${value.hostname.replace("-pooler.", ".")}:${value.port || "5432"}${value.pathname}`;
};
if (db && direct && databaseIdentity(db) !== databaseIdentity(direct)) errors.push("DATABASE_URL et l'URL directe visent des bases différentes");
if (db?.hostname.endsWith(".pooler.supabase.com") && db.port !== "6543") warnings.push("DATABASE_URL : pooler Supabase hors mode transaction (port 6543 attendu à l'exécution)");
if (env.VERCEL && direct && /^db\.[a-z0-9]+\.supabase\.co$/.test(direct.hostname)) warnings.push(`${directKey} : l'hôte direct Supabase est en IPv6 seulement, injoignable depuis Vercel ; utiliser le pooler en mode session (port 5432)`);
const test = url("DATABASE_URL_TEST", ["postgres:", "postgresql:"]);
if (db && test && databaseIdentity(db) === databaseIdentity(test)) errors.push("DATABASE_URL_TEST doit viser une base isolée, jamais la base de l'application");
if (!test) warnings.push("DATABASE_URL_TEST absente : tests d'intégration à exécuter sur une base isolée avant lancement");

group(["AUTH_DISCORD_ID", "AUTH_DISCORD_SECRET"]);
if (present("DISCORD_LINK_CHANNEL_ID")) requireKeys(["DISCORD_BOT_TOKEN"]);
const rulesKeys = ["DISCORD_PUBLIC_KEY", "DISCORD_RULES_CHANNEL_ID", "DISCORD_MEMBER_ROLE_ID"];
if (rulesKeys.some(present)) requireKeys(["DISCORD_BOT_TOKEN", "AUTH_DISCORD_ID", "DISCORD_GUILD_ID", ...rulesKeys]);
if (present("DISCORD_MARKET_CHANNEL_ID")) requireKeys(["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"]);
if (present("DISCORD_ROLES_CHANNEL_ID")) requireKeys(["DISCORD_BOT_TOKEN", "AUTH_DISCORD_ID", "DISCORD_PUBLIC_KEY", "DISCORD_GUILD_ID", "DISCORD_MEMBER_ROLE_ID"]);
if (present("DISCORD_LINKED_ROLE_ID") || present("DISCORD_RANKED_CHANNEL_ID")) requireKeys(["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"]);
for (const key of ["DISCORD_LINK_CHANNEL_ID", "DISCORD_GUILD_ID", "DISCORD_RULES_CHANNEL_ID", "DISCORD_MEMBER_ROLE_ID", "DISCORD_MARKET_CHANNEL_ID", "DISCORD_ROLES_CHANNEL_ID", "DISCORD_MERCHANT_ROLE_ID", "DISCORD_COLLECTOR_ROLE_ID", "DISCORD_FIGHTER_ROLE_ID", "DISCORD_LINKED_ROLE_ID", "DISCORD_RANKED_CHANNEL_ID"]) {
  if (present(key) && !/^[0-9]{17,20}$/.test(env[key])) errors.push(`${key} invalide`);
}
if (present("DISCORD_PUBLIC_KEY") && !/^[a-fA-F0-9]{64}$/.test(env.DISCORD_PUBLIC_KEY)) errors.push("DISCORD_PUBLIC_KEY invalide");
group(["RESEND_API_KEY", "MAIL_FROM"]);
group(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
const app = url("APP_URL", production ? ["https:"] : ["http:", "https:"]);
if (app && (app.pathname !== "/" || app.search || app.hash || app.username || app.password)) errors.push("APP_URL doit être une origine, sans chemin ni identifiants");
if (present("CRON_SECRET") && env.CRON_SECRET.length < 16) errors.push("CRON_SECRET : 16 caractères minimum");
if (present("ABLY_API_KEY") && !/^[^.:\s]+\.[^.:\s]+:\S+$/.test(env.ABLY_API_KEY)) errors.push("ABLY_API_KEY invalide");
if (present("VAPID_PUBLIC_KEY") && !/^[A-Za-z0-9_-]{80,100}$/.test(env.VAPID_PUBLIC_KEY)) errors.push("VAPID_PUBLIC_KEY invalide");
if (present("VAPID_PRIVATE_KEY") && !/^[A-Za-z0-9_-]{40,50}$/.test(env.VAPID_PRIVATE_KEY)) errors.push("VAPID_PRIVATE_KEY invalide");
if (present("VAPID_SUBJECT") && !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT)) errors.push("VAPID_SUBJECT invalide");
if (production) {
  // Sans APP_URL, l'application refuse de démarrer (server/env.ts)
  requireKeys(["APP_URL", "CRON_SECRET"]);
  for (const key of ["AUTH_DISCORD_ID", "ADMIN_DISCORD_ID", "RESEND_API_KEY", "ABLY_API_KEY", "VAPID_PUBLIC_KEY"]) {
    if (!present(key)) warnings.push(`${key} absente : vérifier le service correspondant dans la checklist`);
  }
}
for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const error of errors) console.error(`✖ ${error}`);
if (errors.length) process.exit(1);
console.log(`Environnement ${production ? "production" : target} valide (valeurs secrètes masquées).`);
