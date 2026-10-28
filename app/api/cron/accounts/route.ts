import { processDueDeletionsWith } from "@/server/account/account-core";
import { purgeInactiveGuestsWith } from "@/server/account/guest-purge";
import { purgeOldMessages } from "@/server/chat/queries";
import { cronAuthorized } from "@/server/cron-auth";
import { prisma } from "@/server/db";
import { purgeOldPulls } from "@/server/home/pulls";
import { purgeExpiredRateLimits } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";

// Tâches quotidiennes de ménage (vercel.json) :
// - anonymisation des comptes dont la suppression est arrivée à échéance (idempotente : un compte
//   déjà anonymisé est ignoré) ;
// - comptes invités abandonnés (créés il y a plus de guest.retentionDays jours, sans activité depuis) ;
// - compteurs de limitation expirés, messages de chat et gros tirages périmés (filet de sécurité
//   derrière le ménage paresseux des sondages).
// Détails des échecs dans les logs seulement ; un ménage raté n'empêche pas les autres.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function housekeeping(name: string, task: () => Promise<unknown>) {
  try {
    await task();
    return true;
  } catch (e) {
    console.error(`[cron] ménage ${name}`, e instanceof Error ? e.message : e);
    return false;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const deletions = await processDueDeletionsWith(prisma, new Date(), { budgetMs: 30_000 });
  let rateLimits = 0;
  let guests = { deleted: 0, failed: 0 };
  const cleaned = {
    guests: await housekeeping("invités", async () => {
      guests = await purgeInactiveGuestsWith(prisma, new Date(), { days: await getSetting("guest.retentionDays"), budgetMs: 10_000 });
    }),
    rateLimits: await housekeeping("ratelimit", async () => {
      rateLimits = await purgeExpiredRateLimits(8_000);
    }),
    chat: await housekeeping("chat", async () => purgeOldMessages(await getSetting("chat.retentionHours"))),
    pulls: await housekeeping("tirages", () => purgeOldPulls()),
  };
  return Response.json({ ...deletions, guests, rateLimits, cleaned });
}
