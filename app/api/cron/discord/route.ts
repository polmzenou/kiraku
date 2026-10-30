import { cronAuthorized } from "@/server/cron-auth";
import { syncDiscordMarket } from "@/server/discord/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await syncDiscordMarket());
}
