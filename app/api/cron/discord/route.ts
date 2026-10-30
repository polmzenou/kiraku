import { cronAuthorized } from "@/server/cron-auth";
import { syncDiscordMarket } from "@/server/discord/market";
import { syncDiscordSeasons } from "@/server/discord/seasons";
import { syncLinkedDiscordRoles } from "@/server/discord/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run<T>(name: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try { return await task(); }
  catch {
    console.warn(`[discord] tâche ${name} reportée au prochain passage.`);
    return fallback;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deadline = Date.now() + 45_000;
  const ranked = await run("saisons", () => syncDiscordSeasons(deadline), { published: 0, failed: 1 });
  const linkedRoles = await run("comptes liés", () => syncLinkedDiscordRoles(Math.min(deadline - 15_000, Date.now() + 20_000)), { synced: 0, deferred: 1 });
  const market = await run("marché", () => syncDiscordMarket(deadline), { synced: 0, failed: 1 });
  return Response.json({ ...market, linkedRoles, ranked });
}
