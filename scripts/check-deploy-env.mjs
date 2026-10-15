// Lancé par `npm run vercel-build` avant les migrations : échoue tôt, avec un
// message clair, si l'environnement Vercel (Production / Preview) n'a pas de base.
// N'affiche jamais de valeur, seulement les noms et l'hôte de la base.

const env = process.env;
const target = env.VERCEL_ENV ?? "local";
const pooled = env.DATABASE_URL;
const direct = env.DIRECT_URL || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING;

const host = (value) => {
  try {
    return new URL(value).hostname.replace(/^ep-([a-z]+-[a-z]+)-[^.]+/, "ep-$1-…");
  } catch {
    return "URL invalide";
  }
};

if (!pooled) {
  console.error(
    `\n✖ DATABASE_URL manquante pour l'environnement Vercel « ${target} ».\n` +
      `  Vercel → Settings → Environment Variables : ajoute DATABASE_URL (URL poolée Neon)\n` +
      `  et DIRECT_URL (URL directe) en cochant « ${target === "preview" ? "Preview" : "Production"} ».\n` +
      `  Conseil : Preview → branche Neon dev, Production → branche Neon production.\n`,
  );
  process.exit(1);
}

if (target === "production" && !env.CRON_SECRET) {
  console.error(
    `\n✖ CRON_SECRET manquant pour la production : sans lui, les ventes du marché ne seraient jamais closes\n` +
      `  par le cron. Vercel → Settings → Environment Variables : ajoute CRON_SECRET (openssl rand -hex 32).\n`,
  );
  process.exit(1);
}

if (target === "production" && !env.ABLY_API_KEY) {
  // Pas bloquant : le combat marche sans, le plateau sonde la partie au lieu d'être prévenu en direct
  console.warn(
    `\n⚠ ABLY_API_KEY absente en production : le combat se rabat sur un sondage toutes les 2 s.\n` +
      `  ably.com → ton app → API Keys (droits publish + subscribe), puis Vercel → Environment Variables.\n`,
  );
}

console.log(`Base pour « ${target} » : ${host(pooled)}${direct ? "" : " (URL directe dérivée de DATABASE_URL)"}`);
