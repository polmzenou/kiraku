import { cronAuthorized } from "@/server/cron-auth";
import { syncDiscordMarket } from "@/server/discord/market";
import { syncDiscordSeasons } from "@/server/discord/seasons";
import { syncLinkedDiscordRoles } from "@/server/discord/roles";
import { recordDiscordAlert, resolveDiscordAlert } from "@/server/discord/alert-store";
import { syncDiscordAlerts } from "@/server/discord/alerts";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function run<T>(name: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try { const result = await task(); await resolveDiscordAlert("cron", name); return result; }
  catch {
    console.warn(`[discord] tâche ${name} reportée au prochain passage.`);
    await recordDiscordAlert("cron", name);
    return fallback;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deadline = Date.now() + 45_000;
  const ranked = await run("ranked", () => syncDiscordSeasons(deadline), { published: 0, failed: 1 });
  const linkedRoles = await run("linked-roles", () => syncLinkedDiscordRoles(Math.min(deadline - 15_000, Date.now() + 20_000)), { synced: 0, deferred: 1 });
  const market = await run("market", () => syncDiscordMarket(deadline), { synced: 0, failed: 1 });
  // Temps séparé après la réponse : les alertes ne réduisent pas le budget du marché.
  after(async () => { try { await syncDiscordAlerts(Date.now() + 20_000); } catch { console.warn("[discord] alertes techniques reportées."); } });
  return Response.json({ ...market, linkedRoles, ranked });
}
