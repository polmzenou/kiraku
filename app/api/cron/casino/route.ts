import { sweepCasinoWith } from "@/server/casino/coinflip-core";
import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { pushLater } from "@/server/push/send";

// Tables de pile ou face échues (carte rendue, créateur prévenu), une fois par jour : filet de sécurité derrière
// le balayage paresseux (sondage de la cloche, page de la table, relève d'une table échue).
// Le planificateur envoie « Authorization: Bearer $CRON_SECRET » ; sans secret configuré, la route refuse tout.
// sweepCasinoWith est idempotent : un appel en double ne rend jamais une carte deux fois.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 100;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  let expired = 0;
  try {
    for (;;) {
      const batch = await sweepCasinoWith(prisma, { now: new Date() }, { batch: BATCH }, pushLater);
      expired += batch;
      if (batch < BATCH || Date.now() - started > 45_000) break;
    }
  } catch (e) {
    console.error("[cron] casino", e instanceof Error ? e.message : e);
    return Response.json({ expired, failed: true }, { status: 500 });
  }
  return Response.json({ expired });
}
