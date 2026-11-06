// Mise en page du nom d'une grande rareté au-dessus de la carte révélée. Les noms se règlent dans l'admin
// (« Mythique Black Edition ») : sur une seule ligne, un nom long débordait du téléphone. Il passe
// maintenant sur 2 ou 3 lignes, coupées entre les mots, et sa taille suit sa ligne la plus longue.

/** Au-delà de ce nombre de caractères, une ligne deviendrait trop petite sur un téléphone : on coupe. */
export const ONE_LINE_MAX = 13;
const MAX_LINES = 3;
/** Taille maximale du titre, en % de la largeur disponible (celle d'avant pour les noms courts). */
const MAX_CQI = 10;
/**
 * Largeur d'un caractère en capitales, espacement compris, rapportée à la taille de police. Mesuré en
 * Shippori Mincho B1 : 0,76 em pour « BLACK EDITION », 0,85 em pour « MYTHIQUE » et ses lettres larges.
 */
const CHAR_EM = 0.85;
/** Part de la largeur laissée au texte, sceau et espace déduits. */
const TEXT_SHARE = 84;

const length = (s: string) => Array.from(s).length;

/** Nom tel qu'il s'affiche : espaces superflus retirés, en capitales. */
export function titleText(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

/** Toutes les façons de couper `words` en `count` lignes non vides, dans l'ordre. */
function cuts(words: readonly string[], count: number): string[][] {
  if (count === 1) return [[words.join(" ")]];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - count + 1; i++) {
    for (const rest of cuts(words.slice(i), count - 1)) out.push([words.slice(0, i).join(" "), ...rest]);
  }
  return out;
}

/** Une ligne du haut plus longue que celle du bas coûte un peu et demi de caractère : le titre s'évase vers la carte. */
const TOP_HEAVY_COST = 1.5;

/** Coût d'une coupe : sa ligne la plus longue (la taille du titre en dépend), plus la pénalité d'un haut plus lourd. */
function cost(lines: readonly string[]): number {
  const longest = Math.max(...lines.map(length));
  return longest + (length(lines[0]) > length(lines.at(-1)!) ? TOP_HEAVY_COST : 0);
}

/**
 * Lignes du titre : une seule si le nom est court ; sinon le moins de lignes (3 au plus) dont la plus
 * longue tient sous ONE_LINE_MAX, ou à défaut la coupe la moins coûteuse. Un mot n'est jamais coupé.
 */
export function titleLines(name: string): string[] {
  const text = titleText(name);
  const words = text.split(" ").filter(Boolean);
  if (words.length <= 1 || length(text) <= ONE_LINE_MAX) return text ? [text] : [];
  let best = [text];
  for (let count = 2; count <= Math.min(MAX_LINES, words.length); count++) {
    for (const lines of cuts(words, count)) if (cost(lines) < cost(best)) best = lines;
    if (Math.max(...best.map(length)) <= ONE_LINE_MAX) break;
  }
  return best;
}

/** Taille du titre en cqi (% de la largeur du conteneur) : la ligne la plus longue tient toujours. */
export function titleSizeCqi(lines: readonly string[]): number {
  const longest = Math.max(1, ...lines.map(length));
  return Math.round(Math.min(MAX_CQI, TEXT_SHARE / (longest * CHAR_EM)) * 100) / 100;
}
