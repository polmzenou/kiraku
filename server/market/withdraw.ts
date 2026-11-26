// Compte banni (fiche admin, ban réseau, ban de groupe, « Révoquer et bannir » du parrainage) : tout ce qu'il a en cours
// sur le Marché est retiré, comme ses tables de pile ou face (withdrawCasinoFor). Sans cela, ses ventes continuaient,
// recevaient des mises et le payaient, et un banni en tête d'une enchère gagnait la carte.
import type { PrismaClient } from "@/generated/prisma/client";
import type { OnNotified } from "../social/notify";
import { adminCancelAuctionWith } from "./auction-core";
import { cancelOrderWith } from "./buy-order-core";
import { cancelListingWith, withdrawOfferWith } from "./listing-core";

/**
 * Ventes du joueur et ventes où il mène (annulées : mise en tête rendue, carte rendue au vendeur), avis de recherche
 * (séquestre rendu), annonces d'échange (offres closes, offrants prévenus) et offres en attente. Une transaction par
 * retrait ; un échec est journalisé et n'empêche pas les autres. Rend le nombre de retraits faits.
 */
export async function withdrawMarketFor(
  db: PrismaClient,
  input: { userId: string; adminId: string; now: Date },
  onNotified?: OnNotified,
): Promise<number> {
  const { userId, adminId, now } = input;
  // Le ban est déjà enregistré : une panne ici est journalisée, jamais renvoyée comme un échec du ban
  let found;
  try {
    found = await Promise.all([
      db.auction.findMany({ where: { status: "ACTIVE", OR: [{ sellerId: userId }, { currentBidderId: userId }] }, select: { id: true } }),
      db.buyOrder.findMany({ where: { buyerId: userId, status: "OPEN" }, select: { id: true } }),
      db.tradeListing.findMany({ where: { ownerId: userId, status: "OPEN" }, select: { id: true } }),
      db.listingOffer.findMany({ where: { bidderId: userId, status: "PENDING" }, select: { id: true } }),
    ]);
  } catch (e) {
    console.error("[marche] retrait d'un compte banni (lecture)", e);
    return 0;
  }
  const [auctions, orders, listings, offers] = found;
  let done = 0;
  const attempt = async (what: string, run: () => Promise<unknown>) => {
    try {
      await run();
      done++;
    } catch (e) {
      console.error(`[marche] retrait d'un compte banni (${what})`, e);
    }
  };
  for (const a of auctions) await attempt("vente", () => adminCancelAuctionWith(db, { adminId, auctionId: a.id, now }, onNotified));
  for (const o of orders) await attempt("avis", () => cancelOrderWith(db, { buyerId: userId, orderId: o.id, now }));
  for (const l of listings) await attempt("annonce", () => cancelListingWith(db, { userId, listingId: l.id, now }, onNotified));
  for (const o of offers) await attempt("offre", () => withdrawOfferWith(db, { userId, offerId: o.id, now }));
  return done;
}
