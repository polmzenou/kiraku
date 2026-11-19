import "server-only";
import { cache } from "react";
import { bypassesProfilePrivacy, profileAccess, type ProfileAccess, type ProfileVisibility } from "@/lib/collection/visibility";
import type { Relation } from "@/lib/social/relation";
import { prisma } from "../db";
import { getRelation } from "../social/queries";

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
  // Présence (lib/social/presence.ts), montrée seulement si le visiteur voit le profil
  lastSeenAt: Date | null;
  appearOffline: boolean;
  role: string;
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
    lastSeenAt: true,
    appearOffline: true,
    role: true,
  } as const;
  const exact = await prisma.user.findUnique({ where: { username }, select });
  if (exact) return exact;
  return prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select });
});

/** Ce qu'un visiteur anonyme voit du profil (métadonnées, indexation). */
export function anonymousAccess(owner: ProfileOwnerRow): ProfileAccess {
  return profileAccess(null, owner, { friends: false });
}

/** Visiteur tel que lu en session par getCurrentUser (jamais une donnée venue du client). */
export type ProfileViewer = { id: string; role: string; bannedAt: Date | null };

/**
 * Ce que `viewer` peut voir du profil, et sa relation avec le propriétaire. Un visiteur que le
 * propriétaire a bloqué voit un profil privé et une relation « NONE » : rien ne trahit le blocage.
 * Un admin voit tout (`adminOverride` quand c'est son rôle qui lui ouvre la page).
 */
export async function accessFor(
  viewer: ProfileViewer | null,
  owner: ProfileOwnerRow,
): Promise<ProfileAccess & { relation: Relation | null }> {
  if (!viewer || viewer.id === owner.id) return { ...profileAccess(viewer?.id ?? null, owner, { friends: false }), relation: null };
  const rel = await getRelation(viewer.id, owner.id);
  return {
    ...profileAccess(viewer.id, owner, { friends: rel.relation === "FRIENDS", blocked: rel.blockedByThem }, bypassesProfilePrivacy(viewer)),
    relation: rel.relation,
  };
}
