import "server-only";
import { cache } from "react";
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
      role: true,
      bannedAt: true,
    },
  });
  if (!user) return null;
  // Le hash ne quitte jamais ce module
  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: passwordHash !== null };
});
