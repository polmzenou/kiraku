import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { sweepStaleWith } from "@/server/battle/battle-core";
import { battleCtx } from "@/server/battle/queries";
import { publishBattle } from "@/server/battle/realtime";
import { rollSeasonWith } from "@/server/ranked/ranked-core";

// Balayage quotidien du combat (vercel.json, plan Hobby) : filet de sécurité derrière le balayage
// paresseux (page de la partie, sondage de la cloche). Termine les parties oubliées, ferme les salles
// périmées, libère les places de file abandonnées ; toutes les cartes engagées reviennent en collection.
// Clôt aussi la saison du classé quand elle est terminée.

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
  const started = Date.now();
  const result = { expired: 0, roomsClosed: 0, queueCleared: 0, seasonClosed: null as number | null };
  // Fin de saison du classé (idempotente ; aussi faite à l'affichage de /combat)
  const ctx0 = await battleCtx();
  const season = await rollSeasonWith(prisma, ctx0.now, ctx0.ranked, ctx0.timeZone);
  result.seasonClosed = season.closed?.number ?? null;
  for (;;) {
    const batch = await sweepStaleWith(prisma, await battleCtx(), { limit: 100 });
    await Promise.all(batch.expired.map(publishBattle));
    result.expired += batch.expired.length;
    result.roomsClosed += batch.roomsClosed;
    result.queueCleared += batch.queueCleared;
    const n = batch.expired.length + batch.roomsClosed + batch.queueCleared;
    if (n < 100 || Date.now() - started > 45_000) break;
  }
  return Response.json(result);
}
