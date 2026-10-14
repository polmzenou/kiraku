// Qui voit quoi sur /u/[username]. Fonction pure : les pages et les actions s'en servent toutes.

export const PROFILE_VISIBILITIES = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export type ProfileOwner = {
  id: string;
  profileVisibility: ProfileVisibility;
  showCollection: boolean;
  bannedAt: Date | null;
};

export type ProfileAccess = { isOwner: boolean; profile: boolean; collection: boolean };

/**
 * `friends` : le visiteur est un ami accepté. Les amis arrivent à l'étape 6 : en attendant,
 * l'appelant passe false et FRIENDS se comporte comme PRIVATE.
 */
export function profileAccess(viewerId: string | null, owner: ProfileOwner, rel: { friends: boolean }): ProfileAccess {
  const isOwner = viewerId !== null && viewerId === owner.id;
  if (isOwner) return { isOwner, profile: true, collection: true };
  // Un compte banni n'est plus montré aux autres
  const profile =
    owner.bannedAt === null &&
    (owner.profileVisibility === "PUBLIC" || (owner.profileVisibility === "FRIENDS" && rel.friends));
  return { isOwner, profile, collection: profile && owner.showCollection };
}
