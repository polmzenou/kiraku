import { processDueDeletionsWith } from "@/server/account/account-core";
import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";

// Anonymisation quotidienne des comptes dont la suppression est arrivée à échéance (vercel.json).
// Idempotente : un compte déjà anonymisé est ignoré. Détails des échecs dans les logs seulement.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await processDueDeletionsWith(prisma, new Date(), { budgetMs: 45_000 }));
}
