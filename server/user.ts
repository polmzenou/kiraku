import "server-only";
import { cache } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { auth } from "./auth";
import { prisma } from "./db";

/** Joueur connecté (invité, e-mail ou Discord), lu une fois par requête. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
      discordLinkedAt: true,
      image: true,
      isGuest: true,
      coins: true,
      boosterStock: true,
      boosterAnchor: true,
      pityCount: true,
      standardCount: true,
      bannerPity: true,
      role: true,
      bannedAt: true,
      referredById: true,
      profileVisibility: true,
      showCollection: true,
      locale: true,
      termsVersion: true,
      deletionRequestedAt: true,
      anonymizedAt: true,
      usernameChangedAt: true,
      discordJoinedAt: true,
    },
  });
  if (!user) return null;
  // Le hash ne quitte jamais ce module
  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: passwordHash !== null };
});

/**
 * Joueur qui peut encore écrire : connecté, non banni, sans suppression de compte en cours.
 * Les actions de jeu s'en servent ; les actions RGPD (annuler la suppression, exporter) lisent
 * getCurrentUser directement.
 */
export async function requireActiveUser() {
  const user = await getCurrentUser();
  if (!user || user.bannedAt || isFrozen(user)) return null;
  return user;
}
