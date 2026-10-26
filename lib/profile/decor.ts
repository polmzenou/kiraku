import { isFrameStyle, type FrameStyle } from "./frames";
import { isNameColorStyle, type NameColorStyle } from "./name-colors";

// Décor d'un joueur affiché partout où il apparaît : cadre d'avatar et couleur du pseudo.

export type PlayerDecor = { frame: FrameStyle | null; nameColor: NameColorStyle | null };

export const NO_DECOR: PlayerDecor = { frame: null, nameColor: null };

type Relation<K extends string> = ({ active: boolean } & Record<K, string | null>) | null | undefined;

/** Depuis un select Prisma (relations frame et nameColor) : un cosmétique désactivé ne s'affiche plus. */
export function decorFromRelations(user: { frame?: Relation<"frameStyle">; nameColor?: Relation<"nameColor"> }): PlayerDecor {
  return decorFromColumns(user.frame?.active ? user.frame.frameStyle : null, user.nameColor?.active ? user.nameColor.nameColor : null);
}

/** Depuis du SQL brut (jointures déjà filtrées sur les cosmétiques actifs). */
export function decorFromColumns(frameStyle: string | null | undefined, nameColor: string | null | undefined): PlayerDecor {
  return { frame: isFrameStyle(frameStyle) ? frameStyle : null, nameColor: isNameColorStyle(nameColor) ? nameColor : null };
}
