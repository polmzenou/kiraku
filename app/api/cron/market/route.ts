import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { settleDueWith } from "@/server/market/auction-core";
import { pushLater } from "@/server/market/queries";

// Clôture planifiée des ventes terminées, appelée une fois par jour par Vercel Cron (vercel.json, plan
// Hobby) : filet de sécurité derrière la clôture paresseuse (pages affichées, sondage de la cloche).
// Vercel envoie « Authorization: Bearer $CRON_SECRET » ; sans secret configuré, la route refuse tout.
// settleAuctionWith est idempotent : un appel en double (cron + page affichée) ne clôt rien deux fois.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Une passe par jour peut trouver beaucoup de ventes : on balaie par lots jusqu'à la limite de durée
  const started = Date.now();
  const result = { settled: 0, failed: 0 };
  for (;;) {
    const batch = await settleDueWith(prisma, new Date(), 100, pushLater);
    result.settled += batch.settled;
    result.failed += batch.failed;
    if (batch.settled + batch.failed < 100 || Date.now() - started > 45_000) break;
  }
  // Détails des échecs dans les logs seulement (settleDueWith les journalise)
  return Response.json(result);
}
