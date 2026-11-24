import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { progressDeps } from "@/server/referral/deps";
import { progressReferralWith } from "@/server/referral/progress-core";
import { getSetting } from "@/server/settings";

// Parrainage v2 (étape 18) : avance chaque heure les parrainages en cours, même quand personne n'a le jeu ouvert
// (une étape 2 qui tombe 48 h après le rattachement sans nouvelle ouverture, un versement débloqué par l'équipe…).
// Sur le VPS toutes les heures (deploy/crontab.example). Filet derrière l'avancement paresseux (ouverture d'un
// booster, visite de /parrainage, liaison Discord) : idempotent, un appel en double ne verse rien deux fois.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 200;
const DAY = 86_400_000;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await getSetting("referral.v2.enabled"))) return Response.json({ enabled: false });
  const started = Date.now();
  const deps = await progressDeps(new Date());
  // Au-delà de la fenêtre de l'étape 4 (plus deux jours), seule l'étape 2 peut encore tomber : elle tombe aussi à la
  // prochaine ouverture du filleul
  const since = new Date(deps.now.getTime() - (deps.rules.fideleWindowDays + 2) * DAY);
  const result = { referrals: 0, reached: 0, paid: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.referral.findMany({
      where: { version: 2, revokedAt: null, step4At: null, createdAt: { gte: since } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true },
    });
    for (const { id } of batch) {
      try {
        const outcome = await progressReferralWith(prisma, id, deps);
        result.reached += outcome.reached;
        result.paid += outcome.paid;
      } catch (e) {
        result.failed++;
        console.error("[cron parrainage]", id, e);
      }
      result.referrals++;
      if (Date.now() - started > 50_000) break;
    }
    if (batch.length < BATCH || Date.now() - started > 50_000) break;
    cursor = batch[batch.length - 1].id;
  }
  return Response.json(result);
}
