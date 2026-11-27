// Mode spoiler : floute l'illustration des cartes spoil (personnage ou transformation qui dévoile l'histoire).
// Réglage du compte (User.spoilerBlur, User.spoilerShown) : tout est flouté par défaut, sauf les univers que le
// joueur a choisi de voir en clair. Sans compte, tout reste flouté.
//
// Rendu : <html data-spoiler="hide"> active les règles de flou (FudaFace.css, globals.css) ; chaque carte spoil porte
// sa clé d'univers dans data-spoiler-u, et une feuille générée (spoilerRevealCss) remet en clair les univers choisis
// en réglant les variables --kn-spoiler-*. Les données des cartes restent identiques pour tous (caches partagés).
import { seriesTitle } from "./catalog/display";

export type SpoilerPrefs = { blur: boolean; shown: readonly string[] };

export const DEFAULT_SPOILER_PREFS: SpoilerPrefs = { blur: true, shown: [] };

/** Univers vus en clair au plus (CHECK de la colonne User.spoilerShown). */
export const SPOILER_SHOWN_MAX = 300;

// Clés d'univers : id d'Universe ou de Series, des cuid. Validées avant d'entrer dans la feuille générée.
const KEY = /^[a-z0-9]{20,32}$/;

export function isSpoilerKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

/** Clé d'univers d'une carte : l'univers de sa série, ou sa série seule (même règle que la synergie de combat). */
export function spoilerKeyOf(series: { id: string; universeId: string | null }): string {
  return series.universeId ?? series.id;
}

/** Réglage d'un joueur, ou le défaut (tout flouté) sans compte. Les clés illisibles sont écartées. */
export function spoilerPrefsOf(user: { spoilerBlur: boolean; spoilerShown: readonly string[] } | null | undefined): SpoilerPrefs {
  if (!user) return DEFAULT_SPOILER_PREFS;
  return { blur: user.spoilerBlur, shown: user.spoilerShown.filter(isSpoilerKey) };
}

/** Une carte spoil est-elle floutée pour ce réglage ? Une carte sans clé d'univers reste floutée. */
export function isSpoilerBlurred(prefs: SpoilerPrefs, key: string | null | undefined): boolean {
  return prefs.blur && !(key && prefs.shown.includes(key));
}

/**
 * Feuille qui remet en clair les univers choisis : les règles de flou lisent ces variables, avec le flou en repli.
 * Vide quand rien n'est choisi. Seules des clés validées (minuscules et chiffres) y entrent.
 */
export function spoilerRevealCss(shown: readonly string[]): string {
  const keys = [...new Set(shown.filter(isSpoilerKey))].slice(0, SPOILER_SHOWN_MAX);
  if (!keys.length) return "";
  const selector = keys.map((key) => `[data-spoiler-u="${key}"]`).join(",");
  return `:is(${selector}){--kn-spoiler-blur:blur(0);--kn-spoiler-scale:1;--kn-spoiler-cutout:block;--kn-spoiler-pill:none}`;
}

/**
 * Attributs d'une illustration spoil hors fuda (vignettes, fantômes, cut-in) : `data-spoiler` active le flou de
 * globals.css, `data-spoiler-u` porte la clé d'univers pour la remettre en clair. Rien pour une carte non spoil.
 */
export function spoilerImageAttrs(spoiler: boolean | null | undefined, key?: string | null): { "data-spoiler"?: ""; "data-spoiler-u"?: string } {
  if (!spoiler) return {};
  return isSpoilerKey(key) ? { "data-spoiler": "", "data-spoiler-u": key } : { "data-spoiler": "" };
}

/** Univers proposé dans le réglage : clé, nom (univers, sinon titre de la série seule) et nombre de cartes spoil. */
export type SpoilerUniverse = { key: string; name: string; cards: number };

type SpoilerCardSeries = { id: string; titleRomaji: string; titleEnglish: string | null; universeId: string | null; universe: { name: string } | null };

/** Regroupe les cartes spoil par univers (même clé que la synergie de combat), triées par nom dans la langue. */
export function groupSpoilerUniverses(cards: readonly { series: SpoilerCardSeries }[], locale: string): SpoilerUniverse[] {
  const byKey = new Map<string, SpoilerUniverse>();
  for (const { series } of cards) {
    const key = spoilerKeyOf(series);
    const entry = byKey.get(key);
    if (entry) entry.cards += 1;
    else byKey.set(key, { key, name: series.universe?.name ?? seriesTitle(series, locale), cards: 1 });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }) || a.key.localeCompare(b.key));
}
