import type { Availability, BoosterFamily, BoosterTypeView } from "./types";

// Vitrine des boosters (accueil) : listes par famille, recherche et sélection. Fonctions pures,
// partagées par la page (sélection initiale) et la vitrine côté client (changement sans rechargement).

/** Ce dont la vitrine a besoin pour ranger un booster. `selectable` : faux hors rotation. */
export type ShowcaseEntry = {
  slug: string;
  family: BoosterFamily;
  name: string;
  tagline: string;
  selectable: boolean;
};

/** Minuscules sans accents ni macrons : « Shōnen » → « shonen ». */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Boosters d'une famille : sélectionnables d'abord, puis ceux hors sélection (rotation). */
export function familyRows<T extends ShowcaseEntry>(entries: readonly T[], family: BoosterFamily): { on: T[]; off: T[] } {
  const inFamily = entries.filter((e) => e.family === family);
  return { on: inFamily.filter((e) => e.selectable), off: inFamily.filter((e) => !e.selectable) };
}

/**
 * Recherche dans toutes les familles (nom, accroche, titre de la famille), insensible aux accents.
 * Les boosters sélectionnables passent devant ceux hors sélection.
 */
export function searchEntries<T extends ShowcaseEntry>(
  entries: readonly T[],
  query: string,
  familyTitle: (family: BoosterFamily) => string,
): T[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const hits = entries.filter((e) => normalizeSearch(`${e.name} ${e.tagline} ${familyTitle(e.family)}`).includes(q));
  return [...hits.filter((e) => e.selectable), ...hits.filter((e) => !e.selectable)];
}

/** Booster choisi quand on ouvre l'onglet d'une famille. */
export function firstSelectable<T extends ShowcaseEntry>(entries: readonly T[], family: BoosterFamily): T | undefined {
  return entries.find((e) => e.family === family && e.selectable);
}

/** Rang du booster parmi les sélectionnables de sa famille : « 2 / 4 ». */
export function positionInFamily(entries: readonly ShowcaseEntry[], slug: string): { index: number; total: number } | null {
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) return null;
  const on = familyRows(entries, entry.family).on;
  const index = on.findIndex((e) => e.slug === slug);
  return index === -1 ? null : { index: index + 1, total: on.length };
}

/** Feuille « Tous » : chaque famille non vide, dans l'ordre donné. */
export function groupByFamily<T extends ShowcaseEntry>(
  entries: readonly T[],
  families: readonly BoosterFamily[],
): { family: BoosterFamily; on: T[]; off: T[] }[] {
  return families
    .map((family) => ({ family, ...familyRows(entries, family) }))
    .filter((g) => g.on.length + g.off.length > 0);
}

/**
 * Sélection à l'arrivée sur la page : le booster demandé (?b) s'il est sélectionnable, sinon le
 * premier de la famille demandée (?f), sinon « standard », sinon le premier sélectionnable.
 */
export function initialSelection(
  entries: readonly ShowcaseEntry[],
  asked: { slug?: string; family?: string },
): { slug: string; family: BoosterFamily } | null {
  const bySlug = entries.find((e) => e.slug === asked.slug && e.selectable);
  const byFamily = entries.find((e) => e.family === asked.family && e.selectable);
  const pick = bySlug ?? byFamily ?? entries.find((e) => e.slug === "standard" && e.selectable) ?? entries.find((e) => e.selectable);
  return pick ? { slug: pick.slug, family: pick.family } : null;
}

/**
 * Focus série annoncé en haut de l'accueil : parmi ceux qu'on peut ouvrir, le premier activé
 * (`activatedAt` le plus ancien, puis l'ordre de la famille). Les autres restent dans « Spéciaux ».
 */
export function currentFocus<T extends { type: Pick<BoosterTypeView, "kind" | "activatedAt" | "sortOrder">; availability: Availability }>(
  offers: readonly T[],
): T | null {
  const live = offers.filter((o) => o.type.kind === "FOCUS" && o.availability === "open");
  const at = (o: T) => o.type.activatedAt?.getTime() ?? Infinity;
  return live.sort((a, b) => at(a) - at(b) || a.type.sortOrder - b.type.sortOrder)[0] ?? null;
}
