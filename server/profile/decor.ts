import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { decorFromRelations, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";

// Décor d'un joueur (cadre et couleur de pseudo) à joindre à toute requête qui l'affiche.
// Le passage en PlayerDecor se fait avec decorFromRelations / decorFromColumns (lib/profile/decor.ts).

/** À étaler dans le `select` d'un User. */
export const decorSelect = {
  frame: { select: { frameStyle: true, active: true } },
  nameColor: { select: { nameColor: true, active: true } },
} as const satisfies Prisma.UserSelect;

/**
 * SQL brut : colonnes "frameStyle" et "nameColor" du joueur d'alias `u` (cosmétiques actifs seulement).
 * Des sous-requêtes plutôt que des jointures : elles se glissent aussi dans un GROUP BY u.id.
 */
export const decorColumns = Prisma.sql`(SELECT dc."frameStyle" FROM "Cosmetic" dc WHERE dc.id = u."frameId" AND dc.active) AS "frameStyle",
  (SELECT dc."nameColor" FROM "Cosmetic" dc WHERE dc.id = u."nameColorId" AND dc.active) AS "nameColor"`;

/** Décor d'un seul joueur. */
export async function getPlayerDecor(userId: string): Promise<PlayerDecor> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: decorSelect });
  return user ? decorFromRelations(user) : { frame: null, nameColor: null };
}

export type DecorColumns = { frameStyle: string | null; nameColor: string | null };

/** Joueur tel que les listes sociales et le Marché l'affichent. */
export type PlayerRef = { id: string; username: string; image: string | null; isGuest: boolean; decor: PlayerDecor };

export const playerRefSelect = { id: true, username: true, image: true, isGuest: true, ...decorSelect } as const satisfies Prisma.UserSelect;

export function toPlayerRef({ frame, nameColor, ...player }: Prisma.UserGetPayload<{ select: typeof playerRefSelect }>): PlayerRef {
  return { ...player, decor: decorFromRelations({ frame, nameColor }) };
}
