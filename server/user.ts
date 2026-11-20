import "server-only";
import { cache } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { decorFromRelations } from "@/lib/profile/decor";
import { blocks, requestNetworkBan } from "./anticheat/network-ban";
import { auth } from "./auth";
import { prisma } from "./db";
import { decorSelect } from "./profile/decor";

/**
 * Joueur connecté (invité, e-mail ou Discord), lu une fois par requête. Sur un réseau banni (IP ou appareil), un
 * compte hors équipe est traité comme banni : `bannedAt` prend la date du ban, et chaque vérification existante
 * (requireActiveUser, `user.bannedAt` des actions, en-tête) le coupe d'elle-même.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user, networkBan] = await Promise.all([lookupUser(id), requestNetworkBan()]);
  if (!user) return null;
  // Le hash ne quitte jamais ce module
  const { passwordHash, frame, nameColor, ...rest } = user;
  const bannedAt = rest.bannedAt ?? (blocks(networkBan, rest.role) ? networkBan.since : null);
  return { ...rest, bannedAt, hasPassword: passwordHash !== null, decor: decorFromRelations({ frame, nameColor, prestige: rest.prestige }) };
});

function lookupUser(id: string) {
  return prisma.user.findUnique({
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
      apocalypseKarma: true,
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
      v1WelcomeSeenAt: true,
      ambassadorSince: true,
      lastSeenAt: true,
      appearOffline: true,
      titleAgreement: true,
      createdAt: true,
      ...decorSelect,
    },
  });
}

/**
 * Joueur actif : connecté, non banni, sans suppression de compte en cours ni anonymisation.
 * Les actions de jeu, lectures et sondages s'en servent ; les actions RGPD (annuler la suppression, exporter) lisent
 * getCurrentUser directement.
 */
export async function requireActiveUser() {
  const user = await getCurrentUser();
  if (!user || user.bannedAt || isFrozen(user)) return null;
  return user;
}
