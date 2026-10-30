import "server-only";
import { env } from "../env";

export class DiscordApiError extends Error {
  constructor(readonly status: number, readonly retryAfterMs = 0) {
    super(`Discord (${status || "réseau"})`);
  }
}

/** Aucun corps de réponse ni URL contenant un jeton ne doit apparaître dans les erreurs. */
async function request<T>(path: string, method: string, body: unknown, bot: boolean): Promise<T> {
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
    const seconds = Math.max(Number(data?.retry_after) || 0, Number.isFinite(retry) ? retry : 0);
    throw new DiscordApiError(response.status, Math.max(1000, seconds * 1000));
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
