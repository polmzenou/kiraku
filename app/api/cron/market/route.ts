import { prisma } from "@/server/db";
import { cronAuthorized } from "@/server/cron-auth";
import { settleDueWith } from "@/server/market/auction-core";
import { expireDueWith } from "@/server/market/buy-order-core";
import { expireDueListingsWith } from "@/server/market/listing-core";
import { pushLater } from "@/server/market/queries";

// Clôture planifiée des ventes terminées, expiration des avis de recherche échus (Zeni rendus) et des annonces d'échange
// échues, toutes les 5 minutes sur le VPS (deploy/crontab.example) : sans elle, une vente dont ni le vendeur ni le gagnant
// ne revient attendait la passe suivante (vendeur pas payé, carte réservée). Filet derrière la clôture paresseuse.
// Le planificateur envoie « Authorization: Bearer $CRON_SECRET » ; sans secret configuré, la route refuse tout.
// settleAuctionWith est idempotent : un appel en double (cron + page affichée) ne clôt rien deux fois.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Une passe peut trouver beaucoup de ventes (après une panne) : on balaie par lots jusqu'à la limite de durée
  const started = Date.now();
  const result = { settled: 0, failed: 0, expired: 0, expireFailed: 0, listingsExpired: 0 };
  for (;;) {
    const batch = await settleDueWith(prisma, new Date(), 100, pushLater);
    result.settled += batch.settled;
    result.failed += batch.failed;
    if (batch.settled + batch.failed < 100 || Date.now() - started > 45_000) break;
  }
  // Avis échus : déjà masqués et invendables, le cron ne fait que rendre leurs Zeni
  while (Date.now() - started <= 45_000) {
    const batch = await expireDueWith(prisma, new Date(), 100, pushLater);
    result.expired += batch.expired;
    result.expireFailed += batch.failed;
    if (batch.expired + batch.failed < 100) break;
  }
  // Annonces d'échange échues : closes avec leurs offres (avant, seulement à l'ouverture de « Mes échanges »)
  while (Date.now() - started <= 45_000) {
    const n = await expireDueListingsWith(prisma, new Date(), 100);
    result.listingsExpired += n;
    if (n < 100) break;
  }
  // Détails des échecs dans les logs seulement (settleDueWith les journalise)
  return Response.json(result);
}
