// Couleurs de pseudo : un dégradé clippé au texte avec un halo (classes .name-color-* de globals.css).
// L'admin associe un style à une condition (Cosmetic.nameColor) ; le libellé vient du Cosmetic.

export const NAME_COLOR_STYLES = ["lime", "azure", "violet", "ember", "scarlet", "rainbow", "pastel", "hisui"] as const;
export type NameColorStyle = (typeof NAME_COLOR_STYLES)[number];

/** Pastille du sélecteur. */
export const NAME_COLOR_SWATCH: Record<NameColorStyle, string> = {
  lime: "#a3e635",
  azure: "#38bdf8",
  violet: "#a78bfa",
  ember: "#fb923c",
  scarlet: "#f43f5e",
  rainbow: "conic-gradient(#ff2d4a,#ff9a1f,#ffe600,#a3ff12,#38bdf8,#b44dff,#ff2d4a)",
  pastel: "conic-gradient(#ffb3c7,#ffd6a5,#fdffb6,#caffbf,#9bf6ff,#bdb2ff,#ffb3c7)",
  hisui: "#5bbf8b",
};

/** Classes écrites en entier pour que Tailwind garde les règles de globals.css. */
export const NAME_COLOR_CLASS: Record<NameColorStyle, string> = {
  lime: "name-color name-color-lime",
  azure: "name-color name-color-azure",
  violet: "name-color name-color-violet",
  ember: "name-color name-color-ember",
  scarlet: "name-color name-color-scarlet",
  rainbow: "name-color name-color-rainbow",
  pastel: "name-color name-color-pastel",
  hisui: "name-color name-color-hisui",
};

export function isNameColorStyle(value: unknown): value is NameColorStyle {
  return typeof value === "string" && (NAME_COLOR_STYLES as readonly string[]).includes(value);
}
