import { cronAuthorized } from "@/server/cron-auth";
import { syncDiscordMarket } from "@/server/discord/market";
import { syncDiscordSeasons } from "@/server/discord/seasons";
import { syncLinkedDiscordRoles } from "@/server/discord/roles";
import { syncDiscordAvatars } from "@/server/discord/avatars";
import { syncDiscordCasino } from "@/server/discord/casino";
import { syncDiscordPrestige } from "@/server/discord/prestige";
import { syncDiscordReferrals } from "@/server/discord/referral-feed";
import { openDiscordAlerts, recordDiscordAlert, resolveDiscordAlert } from "@/server/discord/alert-store";
import { syncDiscordAlerts } from "@/server/discord/alerts";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Une tâche du passage ; un incident « cron » n'est résolu que s'il est ouvert (lus une fois au début du passage). */
async function runTask<T>(open: ReadonlySet<string>, name: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const result = await task();
    if (open.has(name)) await resolveDiscordAlert("cron", name);
    return result;
  } catch {
    console.warn(`[discord] tâche ${name} reportée au prochain passage.`);
    await recordDiscordAlert("cron", name);
    return fallback;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deadline = Date.now() + 45_000;
  const open = await openDiscordAlerts("cron");
  const run = <T,>(name: string, task: () => Promise<T>, fallback: T) => runTask(open, name, task, fallback);
  const ranked = await run("ranked", () => syncDiscordSeasons(deadline), { published: 0, failed: 1 });
  const linkedRoles = await run("linked-roles", () => syncLinkedDiscordRoles(Math.min(deadline - 15_000, Date.now() + 20_000)), { synced: 0, deferred: 1 });
  const market = await run("market", () => syncDiscordMarket(deadline), { synced: 0, failed: 1 });
  // Casino : ouverture postée une fois à l'heure dite, gros lancers relayés dans la minute
  const casino = await run("casino", () => syncDiscordCasino(Math.min(deadline, Date.now() + 15_000)), { opening: false, relayed: 0, failed: 1 });
  // Prestige : renaissances et éditions gravées tirées, relayées dans la minute
  const prestige = await run("prestige", () => syncDiscordPrestige(Math.min(deadline, Date.now() + 10_000)), { relayed: 0, failed: 1 });
  // Parrainage v2 : versements, blocages et décisions dans le salon privé de l'équipe
  const referral = await run("referral", () => syncDiscordReferrals(Math.min(deadline, Date.now() + 10_000)), { relayed: 0, failed: 1 });
  // Quelques avatars par passage, sur le temps restant (10 s au plus)
  const avatars = await run("avatars", () => syncDiscordAvatars(Math.min(deadline, Date.now() + 10_000)), { checked: 0, updated: 0 });
  // Temps séparé après la réponse : les alertes ne réduisent pas le budget du marché.
  after(async () => { try { await syncDiscordAlerts(Date.now() + 20_000); } catch { console.warn("[discord] alertes techniques reportées."); } });
  return Response.json({ ...market, linkedRoles, ranked, avatars, casino, prestige, referral });
}
