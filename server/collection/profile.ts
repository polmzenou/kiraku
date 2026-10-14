import "server-only";
import { cache } from "react";
import { profileAccess, type ProfileVisibility } from "@/lib/collection/visibility";
import { prisma } from "../db";

// Profil public /u/[username] : seuls des champs publics sortent d'ici (jamais l'e-mail ni le solde).

export type ProfileOwnerRow = {
  id: string;
  username: string;
  image: string | null;
  isGuest: boolean;
  createdAt: Date;
  profileVisibility: ProfileVisibility;
  showCollection: boolean;
  bannedAt: Date | null;
};

/** Joueur par pseudo, sans tenir compte de la casse (la page redirige vers l'orthographe exacte). */
export const findProfileOwner = cache(async (username: string): Promise<ProfileOwnerRow | null> => {
  const select = {
    id: true,
    username: true,
    image: true,
    isGuest: true,
    createdAt: true,
    profileVisibility: true,
    showCollection: true,
    bannedAt: true,
  } as const;
  const exact = await prisma.user.findUnique({ where: { username }, select });
  if (exact) return exact;
  return prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select });
});

/** Ce que `viewerId` peut voir du profil (les amis arrivent à l'étape 6). */
export function accessFor(viewerId: string | null, owner: ProfileOwnerRow) {
  return profileAccess(viewerId, owner, { friends: false });
}
