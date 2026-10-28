import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { env } from "./env";

type Rule = { limit: number; windowSeconds: number };
type Result = { success: boolean };

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<string, Ratelimit>();

function upstashLimiter(rule: Rule) {
  const id = `${rule.limit}/${rule.windowSeconds}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
      prefix: "kiraku:rl",
    });
    limiters.set(id, limiter);
  }
  return limiter;
}

// Repli en mémoire pour le dev local sans Upstash (non partagé entre instances).
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, rule: Rule): Result {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return { success: true };
  }
  entry.count += 1;
  return { success: entry.count <= rule.limit };
}

/** key = « action:identifiant », ex. « guest:1.2.3.4 » ou « auth:userId ». */
export async function rateLimit(key: string, rule: Rule): Promise<Result> {
  if (!redis) return memoryLimit(key, rule);
  try {
    const { success } = await upstashLimiter(rule).limit(key);
    return { success };
  } catch (error) {
    // Upstash indisponible (quota mensuel épuisé, panne) : repli en mémoire plutôt que de faire
    // échouer toutes les actions du site
    console.error("[ratelimit] Upstash indisponible, repli en mémoire", error instanceof Error ? error.message : error);
    return memoryLimit(key, rule);
  }
}

/** IP du client telle que fournie par Vercel (ou « local » en dev). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
