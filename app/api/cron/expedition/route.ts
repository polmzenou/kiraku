import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { overdueExpeditions, sweepExpeditions } from "@/server/expedition/queries";

// Expéditions rentrées (étape 14) : clôture, gains, cartes rendues et notification « De retour ! », même
// quand le joueur n'a pas le jeu ouvert. Sur le VPS toutes les 5 minutes (deploy/crontab.example) ; vercel.json
// garde un appel par jour pour un déploiement Vercel. Filet derrière la clôture paresseuse (page, sondage de la
// cloche) : la clôture est idempotente, un appel en double ne verse rien deux fois. Purge aussi les vieux plateaux
// d'offres, et compte les expéditions dont la clôture échoue encore (overdue) pour alerter.

export const dynamic = "force-dynamic";
// Plafond d'exécution d'une fonction Vercel ; sans effet sur le VPS (le budget de 45 s ci-dessous borne la boucle)
export const maxDuration = 60;

const BATCH = 100;
/** Plateaux d'offres gardés (jours) : au-delà, ils ne servent plus à rien. */
const BOARD_RETENTION_DAYS = 7;
/** Une expédition rentrée depuis plus longtemps que ça devrait être close (cron toutes les 5 minutes). */
const OVERDUE_AFTER_MS = 15 * 60_000;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = { settled: 0, due: 0, boardsPurged: 0, overdue: 0 };
  for (;;) {
    const batch = await sweepExpeditions(new Date(), BATCH);
    result.settled += batch.settled;
    result.due += batch.due;
    if (batch.due < BATCH || batch.settled === 0 || Date.now() - started > 45_000) break;
  }
  const purged = await prisma.expeditionBoard.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - BOARD_RETENTION_DAYS * 86_400_000) } },
  });
  result.boardsPurged = purged.count;
  // Toujours en route plus de 15 minutes après leur retour : leur clôture échoue (détails dans les journaux)
  result.overdue = await overdueExpeditions(new Date(), OVERDUE_AFTER_MS);
  if (result.overdue > 0) console.error(`[expedition] ${result.overdue} expédition(s) rentrée(s) depuis plus de 15 min et toujours pas closes`);
  return Response.json(result);
}
