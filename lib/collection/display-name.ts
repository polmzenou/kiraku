// Pseudo d'un autre joueur affiché hors de son profil (tirage partagé, vendeur, enchérisseurs) :
// mêmes règles que le profil public, pour ne rien révéler qu'un profil privé cacherait.
import { profileAccess, type ProfileVisibility } from "./visibility";

export type NamedPlayer = {
  id: string;
  username: string;
  profileVisibility: ProfileVisibility;
  bannedAt: Date | null;
  anonymizedAt: Date | null;
};

/**
 * Le pseudo, ou un libellé générique traduit s'il doit rester caché à ce visiteur :
 * soi-même toujours ; sinon profil public, ou réservé aux amis et ami accepté, jamais un compte banni
 * ni quelqu'un qui a bloqué le visiteur.
 */
export function displayNameFor(
  player: NamedPlayer,
  viewerId: string | null,
  rel: { friends: boolean; blocked: boolean },
  labels = { hidden: "Joueur", deleted: "Compte supprimé" },
): string {
  if (player.anonymizedAt) return labels.deleted;
  const access = profileAccess(viewerId, { ...player, showCollection: false }, rel);
  return access.profile ? player.username : labels.hidden;
}
