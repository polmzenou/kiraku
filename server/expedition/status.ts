import "server-only";
import { prisma } from "../db";

// Lectures légères de l'état des expéditions d'un joueur (en-tête, garde de la page), sans charger
// la logique de clôture.

/** Expédition en route ou résultat à révéler : la page reste ouverte au joueur même si le jeu est coupé. */
export async function hasPendingExpedition(userId: string): Promise<boolean> {
  const row = await prisma.expedition.findFirst({
    where: { userId, OR: [{ status: "ACTIVE" }, { status: "COMPLETED", revealedAt: null }] },
    select: { id: true },
  });
  return row !== null;
}

/** Pastille de la nav : un résultat attend d'être révélé (ou une expédition est rentrée sans être close). */
export async function hasExpeditionToReveal(userId: string, now = new Date()): Promise<boolean> {
  const row = await prisma.expedition.findFirst({
    where: {
      userId,
      OR: [
        { status: "COMPLETED", revealedAt: null },
        { status: "ACTIVE", endsAt: { lte: now } },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}
