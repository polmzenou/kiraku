import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";

type Rule = { limit: number; windowSeconds: number };
type Result = { success: boolean };
type Options = {
  /**
   * « memory » : compteur propre à l'instance, sans aucune requête réseau. Pour les lectures et les
   * sondages, où une protection approximative suffit et où une écriture en base à chaque appel
   * coûterait plus que ce qu'elle protège.
   */
  store?: "db" | "memory";
};

// Au-delà, la base est jugée indisponible pour cette vérification : repli en mémoire plutôt que de
// faire attendre le joueur
const DB_TIMEOUT_MS = 1_500;

// Compteurs en mémoire : repli quand la base ne répond pas, et magasin des lectures (non partagé
// entre instances).
const memory = new Map<string, { count: number; resetAt: number }>();
const MEMORY_SWEEP_AT = 10_000;

function memoryLimit(key: string, rule: Rule): Result {
  const now = Date.now();
  if (memory.size >= MEMORY_SWEEP_AT) {
    for (const [k, e] of memory) if (e.resetAt <= now) memory.delete(k);
  }
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return { success: true };
  }
  entry.count += 1;
  return { success: entry.count <= rule.limit };
}

/**
 * Une seule requête atomique : crée le compteur, l'incrémente, ou le remet à 1 si sa fenêtre est
 * passée. La clé porte la règle, pour que deux règles sur la même clé ne se mélangent pas.
 */
async function dbLimit(key: string, rule: Rule): Promise<Result> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}::int))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return { success: Number(rows[0]?.count ?? 1) <= rule.limit };
}

let lastErrorLog = 0;

function logFallback(error: unknown) {
  // Une ligne par minute au plus : une panne de base ne doit pas noyer les logs
  const now = Date.now();
  if (now - lastErrorLog < 60_000) return;
  lastErrorLog = now;
  console.error("[ratelimit] base indisponible, repli en mémoire", error instanceof Error ? error.message : error);
}

/** key = « action:identifiant », ex. « guest:1.2.3.4 » ou « auth:userId ». Ne lève jamais. */
export async function rateLimit(key: string, rule: Rule, options: Options = {}): Promise<Result> {
  const id = `${key}|${rule.limit}/${rule.windowSeconds}`;
  if (options.store === "memory") return memoryLimit(id, rule);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      dbLimit(id, rule),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    // Base indisponible ou lente : le jeu continue avec la limite de l'instance
    logFallback(error);
    return memoryLimit(id, rule);
  } finally {
    clearTimeout(timer);
  }
}

/** Supprime par lots les compteurs expirés depuis plus d'une heure (cron quotidien). */
export async function purgeExpiredRateLimits(budgetMs = 10_000): Promise<number> {
  const started = Date.now();
  let removed = 0;
  for (;;) {
    const n = await prisma.$executeRaw`
      DELETE FROM "RateLimit" WHERE "key" IN (
        SELECT "key" FROM "RateLimit" WHERE "resetAt" < now() - interval '1 hour' LIMIT 5000
      )`;
    removed += n;
    if (n < 5000 || Date.now() - started > budgetMs) return removed;
  }
}

/** IP du client telle que fournie par Vercel (ou « local » en dev). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
