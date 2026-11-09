import { decorFromRelations, type PlayerDecor } from "@/lib/profile/decor";
import type { FrameStyle } from "@/lib/profile/frames";
import type { NameColorStyle } from "@/lib/profile/name-colors";

/** Joueur affiché hors de son profil. `profile` : pseudo à mettre dans le lien, null s'il ne doit pas en avoir. */
export type ShownPlayer = {
  name: string;
  profile: string | null;
  image: string | null;
  color: NameColorStyle | null;
  frame: FrameStyle | null;
};

/** Un joueur sans identité à montrer : le libellé seul, ni lien ni avatar. */
export function anonymousPlayer(name: string): ShownPlayer {
  return { name, profile: null, image: null, color: null, frame: null };
}

/**
 * `name` vient de publicNamesFor. Quand c'est un libellé générique (profil privé, blocage, compte banni
 * ou supprimé), rien d'autre ne sort : ni lien, ni avatar, ni décor qui permettraient de reconnaître le joueur.
 */
export function shownPlayer(name: string, player: { username: string; image: string | null } & Parameters<typeof decorFromRelations>[0]): ShownPlayer {
  if (name !== player.username) return anonymousPlayer(name);
  const { frame, nameColor } = decorFromRelations(player);
  return { name, profile: player.username, image: player.image, color: nameColor, frame };
}

/** Depuis un PlayerRef (échanges) : `name` est le nom affiché, qui diffère du pseudo pour un invité. */
export function shownPlayerRef(name: string, player: { username: string; image: string | null; decor: PlayerDecor }): ShownPlayer {
  return { name, profile: player.username, image: player.image, color: player.decor.nameColor, frame: player.decor.frame };
}
