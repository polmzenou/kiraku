import "server-only";
import { displayNameFor } from "@/lib/collection/display-name";
import { copyLabel } from "@/lib/discord/copy-label";
import { copyMarksOf } from "../prestige/copy-marks";

// Libellés des annonces Discord (en français, comme le salon) : nom d'un joueur, exemplaire spécial annoncé.

/** Champs à lire pour nommer un joueur dans un salon. */
export const discordPlayerSelect = { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true } as const;

/** Un profil privé ou réservé aux amis est annoncé « Un joueur », un compte supprimé « Compte supprimé ». */
export function discordPlayerName(player: Parameters<typeof displayNameFor>[0]): string {
  return displayNameFor(player, null, { friends: false, blocked: false }, { hidden: "Un joueur", deleted: "Compte supprimé" });
}

/** « Gravée 初摺 n° 17 / 25 · héritage 3 » pour l'exemplaire annoncé ; null pour un ordinaire ou sans exemplaire. */
export async function copyLabelOf(userCardId: string | null | undefined): Promise<string | null> {
  return userCardId ? copyLabel((await copyMarksOf([userCardId])).get(userCardId)) : null;
}
