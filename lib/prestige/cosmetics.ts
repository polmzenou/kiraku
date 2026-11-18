import type { ProfileCondition } from "../profile/conditions";
import type { FrameStyle } from "../profile/frames";
import type { NameColorStyle } from "../profile/name-colors";

// Jeu de cosmétiques du prestige, installé depuis /admin/prestige : seuls les identifiants absents sont créés, ceux
// déjà présents (édités dans l'admin) ne sont jamais touchés.

export type PrestigeCosmetic = {
  slug: string;
  kind: "TITLE" | "FRAME" | "NAME_COLOR";
  label: { fr: string; frFem?: string; en: string };
  hint: { fr: string; en: string };
  frameStyle?: FrameStyle;
  nameColor?: NameColorStyle;
  condition: ProfileCondition;
  sortOrder: number;
};

const prestige = (n: number) => ({ fr: `Atteindre le prestige ${n}.`, en: `Reach prestige ${n}.` });

export const PRESTIGE_COSMETICS: readonly PrestigeCosmetic[] = [
  { slug: "prestige-rene", kind: "TITLE", label: { fr: "René", frFem: "Renée", en: "Reborn" }, hint: prestige(1), condition: { type: "PRESTIGE", n: 1 }, sortOrder: 900 },
  { slug: "prestige-trois-vies", kind: "TITLE", label: { fr: "Aux trois vies", en: "Thrice reborn" }, hint: prestige(3), condition: { type: "PRESTIGE", n: 3 }, sortOrder: 901 },
  { slug: "prestige-eternel", kind: "TITLE", label: { fr: "Éternel", frFem: "Éternelle", en: "Eternal" }, hint: prestige(10), condition: { type: "PRESTIGE", n: 10 }, sortOrder: 902 },
  {
    slug: "prestige-gardien-sanctuaire",
    kind: "TITLE",
    label: { fr: "Gardien du sanctuaire", frFem: "Gardienne du sanctuaire", en: "Sanctuary keeper" },
    hint: { fr: "Consacrer une héritière au sanctuaire.", en: "Consecrate an heirloom to the sanctuary." },
    condition: { type: "CONSECRATED_COUNT", n: 1 },
    sortOrder: 903,
  },
  {
    slug: "prestige-maitre-estampeur",
    kind: "TITLE",
    label: { fr: "Maître estampeur", frFem: "Maîtresse estampeuse", en: "Master printmaker" },
    hint: { fr: "Posséder 5 éditions gravées.", en: "Own 5 engraved editions." },
    condition: { type: "PRINTINGS_OWNED", n: 5 },
    sortOrder: 904,
  },
  { slug: "prestige-cadre-tensei", kind: "FRAME", label: { fr: "Tensei", en: "Tensei" }, hint: prestige(1), frameStyle: "tensei", condition: { type: "PRESTIGE", n: 1 }, sortOrder: 900 },
  {
    slug: "prestige-cadre-hanga",
    kind: "FRAME",
    label: { fr: "Hanga", en: "Hanga" },
    hint: { fr: "Posséder une édition gravée.", en: "Own an engraved edition." },
    frameStyle: "hanga",
    condition: { type: "PRINTINGS_OWNED", n: 1 },
    sortOrder: 901,
  },
  { slug: "prestige-cadre-hono", kind: "FRAME", label: { fr: "Hono", en: "Hono" }, hint: prestige(5), frameStyle: "hono", condition: { type: "PRESTIGE", n: 5 }, sortOrder: 902 },
  // Pseudo or : débloqué dès la première renaissance, puis choisi (ou non) dans « Personnaliser » comme les autres
  { slug: "prestige-pseudo-kin", kind: "NAME_COLOR", label: { fr: "Feuille d'or", en: "Gold leaf" }, hint: prestige(1), nameColor: "kin", condition: { type: "PRESTIGE", n: 1 }, sortOrder: 900 },
];
