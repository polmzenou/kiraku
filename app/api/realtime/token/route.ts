import { prisma } from "@/server/db";
import { tokenRequest } from "@/server/battle/realtime";
import { rateLimit } from "@/server/ratelimit";
import { getCurrentUser } from "@/server/user";

// Jeton Ably du navigateur (authUrl du client) : abonnement seul, à son propre canal et à celui d'une
// partie dont il est participant. La clé Ably ne quitte jamais le serveur.

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`realtime-token:${user.id}`, { limit: 30, windowSeconds: 60 })).success) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = new URL(request.url).searchParams.get("battle");
  let battleId: string | null = null;
  if (raw) {
    if (!ID.test(raw)) return Response.json({ error: "invalid" }, { status: 400 });
    const b = await prisma.battle.findUnique({ where: { id: raw }, select: { p1Id: true, p2Id: true } });
    if (!b || (b.p1Id !== user.id && b.p2Id !== user.id)) return Response.json({ error: "not_found" }, { status: 404 });
    battleId = raw;
  }
  const token = await tokenRequest(user.id, battleId);
  if (!token) return Response.json({ error: "disabled" }, { status: 404 });
  return Response.json(token, { headers: { "Cache-Control": "no-store" } });
}
