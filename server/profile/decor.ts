import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { decorFromRelations, NO_DECOR, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";

// Décor d'un joueur (cadre et couleur de pseudo) à joindre à toute requête qui l'affiche.
// Le passage en PlayerDecor se fait avec decorFromRelations / decorFromColumns (lib/profile/decor.ts).

/** À étaler dans le `select` d'un User. */
export const decorSelect = {
  frame: { select: { frameStyle: true, active: true } },
  nameColor: { select: { nameColor: true, active: true } },
  prestige: true,
} as const satisfies Prisma.UserSelect;

/**
 * SQL brut : colonnes "frameStyle", "nameColor" (cosmétiques actifs seulement) et "prestige" du joueur d'alias `u`.
 * Des sous-requêtes plutôt que des jointures : elles se glissent aussi dans un GROUP BY u.id.
 */
export const decorColumns = Prisma.sql`(SELECT dc."frameStyle" FROM "Cosmetic" dc WHERE dc.id = u."frameId" AND dc.active) AS "frameStyle",
  (SELECT dc."nameColor" FROM "Cosmetic" dc WHERE dc.id = u."nameColorId" AND dc.active) AS "nameColor",
  u."prestige" AS "prestige"`;

/** Décor d'un seul joueur. */
export async function getPlayerDecor(userId: string): Promise<PlayerDecor> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: decorSelect });
  return user ? decorFromRelations(user) : NO_DECOR;
}

export type DecorColumns = { frameStyle: string | null; nameColor: string | null; prestige: number };

/** Joueur tel que les listes sociales et le Marché l'affichent. */
/** `masked` : pseudo remplacé par un libellé (profil caché à ce lecteur), à afficher sans lien ni avatar. */
export type PlayerRef = { id: string; username: string; image: string | null; isGuest: boolean; decor: PlayerDecor; masked?: true };

export const playerRefSelect = { id: true, username: true, image: true, isGuest: true, ...decorSelect } as const satisfies Prisma.UserSelect;

export function toPlayerRef({ frame, nameColor, prestige, ...player }: Prisma.UserGetPayload<{ select: typeof playerRefSelect }>): PlayerRef {
  return { ...player, decor: decorFromRelations({ frame, nameColor, prestige }) };
}
