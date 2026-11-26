import "server-only";
import { env } from "../env";

export class DiscordApiError extends Error {
  constructor(readonly status: number, readonly retryAfterMs = 0) {
    super(`Discord (${status || "réseau"})`);
  }
}

// Limites de Discord (429), propres à ce processus. Tant qu'un 429 récent court, les boucles du cron s'arrêtent au lieu
// d'enchaîner les refus (comptés par Cloudflare contre le bot) ; une limite globale bloque en plus tout appel du bot
// avant même la requête.
let limitedUntil = 0;
let globalUntil = 0;

/** Un 429 reçu il y a moins que le délai imposé : le passage du cron s'arrête là et reprend au suivant. */
export function discordPaused(): boolean {
  return Date.now() < Math.max(limitedUntil, globalUntil);
}

/** Aucun corps de réponse ni URL contenant un jeton ne doit apparaître dans les erreurs. */
async function request<T>(path: string, method: string, body: unknown, bot: boolean): Promise<T> {
  if (bot && Date.now() < globalUntil) throw new DiscordApiError(429, globalUntil - Date.now());
  let response: Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { ...(!(body instanceof FormData) && { "Content-Type": "application/json" }), ...(bot && { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }) },
      ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new DiscordApiError(0);
  }
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after"));
    const data = response.status === 429 ? await response.json().catch(() => null) : null;
    // Corps d'une autre erreur jamais lu : la connexion est rendue tout de suite, pas au ramasse-miettes
    if (response.status !== 429) await response.body?.cancel().catch(() => {});
    const seconds = Math.max(Number(data?.retry_after) || 0, Number.isFinite(retry) ? retry : 0);
    const wait = Math.max(1000, seconds * 1000);
    if (bot && response.status === 429) {
      limitedUntil = Math.max(limitedUntil, Date.now() + wait);
      if (data?.global === true || response.headers.get("x-ratelimit-global") === "true") globalUntil = Math.max(globalUntil, Date.now() + wait);
    }
    throw new DiscordApiError(response.status, wait);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new DiscordApiError(0);
  }
}

export function discordBotRequest<T = void>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!env.DISCORD_BOT_TOKEN) return Promise.reject(new DiscordApiError(0));
  return request<T>(path, method, body, true);
}

export function editInteractionReply(applicationId: string, token: string, content: string): Promise<unknown> {
  return request(`/webhooks/${applicationId}/${encodeURIComponent(token)}/messages/@original`, "PATCH", {
    content, allowed_mentions: { parse: [] },
  }, false);
}
