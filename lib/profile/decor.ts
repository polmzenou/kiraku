import { isFrameStyle, type FrameStyle } from "./frames";
import { isNameColorStyle, type NameColorStyle } from "./name-colors";

// Décor d'un joueur affiché partout où il apparaît : cadre d'avatar, couleur du pseudo, et prestige (chiffre
// romain en or au-dessus de l'avatar, dès le prestige I).

export type PlayerDecor = { frame: FrameStyle | null; nameColor: NameColorStyle | null; prestige: number };

export const NO_DECOR: PlayerDecor = { frame: null, nameColor: null, prestige: 0 };

/** Prestige lu en base : un entier positif, sinon 0. */
export function prestigeOf(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

type Relation<K extends string> = ({ active: boolean } & Record<K, string | null>) | null | undefined;

/** Depuis un select Prisma (relations frame et nameColor) : un cosmétique désactivé ne s'affiche plus. */
export function decorFromRelations(user: { frame?: Relation<"frameStyle">; nameColor?: Relation<"nameColor">; prestige?: number | null }): PlayerDecor {
  return decorFromColumns({ frameStyle: user.frame?.active ? user.frame.frameStyle : null, nameColor: user.nameColor?.active ? user.nameColor.nameColor : null, prestige: user.prestige });
}

/** Depuis du SQL brut (jointures déjà filtrées sur les cosmétiques actifs). */
export function decorFromColumns(row: { frameStyle?: string | null; nameColor?: string | null; prestige?: number | null }): PlayerDecor {
  return { frame: isFrameStyle(row.frameStyle) ? row.frameStyle : null, nameColor: isNameColorStyle(row.nameColor) ? row.nameColor : null, prestige: prestigeOf(row.prestige) };
}
