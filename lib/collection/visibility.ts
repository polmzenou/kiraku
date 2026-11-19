// Qui voit quoi sur /u/[username]. Fonction pure : les pages et les actions s'en servent toutes.

export const PROFILE_VISIBILITIES = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export type ProfileOwner = {
  id: string;
  profileVisibility: ProfileVisibility;
  showCollection: boolean;
  bannedAt: Date | null;
};

/**
 * `adminOverride` : le visiteur est un admin qui voit le profil ou la collection uniquement grâce à son rôle
 * (un joueur à sa place n'y aurait pas accès). Ce qu'un joueur ordinaire verrait se retrouve donc avec
 * `collection && !adminOverride` (la collection n'est jamais visible sans le profil).
 */
export type ProfileAccess = { isOwner: boolean; profile: boolean; collection: boolean; adminOverride: boolean };

/** Le visiteur passe-t-il outre la confidentialité des profils ? Rôle ADMIN, compte non banni. */
export function bypassesProfilePrivacy(viewer: { role: string; bannedAt: Date | null } | null): boolean {
  return viewer !== null && viewer.role === "ADMIN" && viewer.bannedAt === null;
}

/**
 * `friends` : le visiteur est un ami accepté. `blocked` : le propriétaire a bloqué le visiteur ;
 * son profil lui répond alors exactement comme un profil privé (rien ne révèle le blocage).
 * `asAdmin` (lu en session côté serveur, jamais venu du client) : l'admin voit tout, profil et collection,
 * quels que soient les réglages, le blocage ou le bannissement.
 */
export function profileAccess(
  viewerId: string | null,
  owner: ProfileOwner,
  rel: { friends: boolean; blocked?: boolean },
  asAdmin = false,
): ProfileAccess {
  const isOwner = viewerId !== null && viewerId === owner.id;
  if (isOwner) return { isOwner, profile: true, collection: true, adminOverride: false };
  // Un compte banni n'est plus montré aux autres
  const profile =
    owner.bannedAt === null &&
    !rel.blocked &&
    (owner.profileVisibility === "PUBLIC" || (owner.profileVisibility === "FRIENDS" && rel.friends));
  const collection = profile && owner.showCollection;
  if (asAdmin && viewerId !== null) return { isOwner, profile: true, collection: true, adminOverride: !collection };
  return { isOwner, profile, collection, adminOverride: false };
}
