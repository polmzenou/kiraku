import type { ImportedCharacter } from "./anilist";
import { rarityForRank, statsFor, type Rarity, type RarityThresholds, type StatCoefficients } from "./rarity";

// Import des personnages d'une seule œuvre (scripts/import-media.mts) : on ajoute des cartes sans
// jamais reclasser ni modifier celles du catalogue. Logique pure, testée sans base ni réseau.

export type MediaRole = "MAIN" | "SUPPORTING" | "BACKGROUND";
/** Personnage de l'œuvre : `role` est son rôle dans CETTE œuvre (la carte garde celui de son œuvre principale). */
export type MediaCharacter = { character: ImportedCharacter; mediaRole: MediaRole | null };

/** Carte du catalogue actuel, pour le placement par favoris. */
export type CatalogCard = { anilistId: number | null; favorites: number; rank: number | null; rarity: Rarity; power: number; ki: number };

export type MediaSelection = {
  /** Ids AniList voulus (vide = tous ceux de l'œuvre). */
  ids: readonly number[];
  roles: readonly MediaRole[];
  minFavorites: number;
  limit: number | null;
};

export type MediaEntry = {
  character: ImportedCharacter;
  mediaRole: MediaRole | null;
  rank: number;
  rarity: Rarity;
  power: number;
  ki: number;
  /** Rareté imposée en ligne de commande (sinon déduite des favoris). */
  forced: boolean;
};

export type MediaSkip = { anilistId: number; name: string; reason: "existing" | "role" | "favorites" | "limit" | "duplicate" };

/** « 402683=MYTHIC,402555=LEGENDARY » → Map ; null si une paire est mal formée. */
export function parseRarityOverrides(value: string | undefined, known: readonly Rarity[]): Map<number, Rarity> | null {
  const out = new Map<number, Rarity>();
  if (!value?.trim()) return out;
  for (const pair of value.split(",")) {
    const [id, rarity] = pair.split("=").map((s) => s.trim());
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0 || !rarity || !known.includes(rarity.toUpperCase())) return null;
    out.set(n, rarity.toUpperCase());
  }
  return out;
}

/** « 1,2,3 » → [1, 2, 3] ; null si un élément n'est pas un entier positif. */
export function parseIdList(value: string | undefined): number[] | null {
  if (!value?.trim()) return [];
  const ids = value.split(",").map((s) => Number(s.trim()));
  return ids.every((n) => Number.isInteger(n) && n > 0) ? [...new Set(ids)] : null;
}

/**
 * Garde les personnages à ajouter : jamais un anilistId déjà présent en base (quel que soit son
 * statut), puis filtres de rôle, de favoris et de nombre. Les ids demandés explicitement passent
 * outre le rôle et les favoris. Ordre : favoris décroissants.
 */
export function selectNewCharacters(
  characters: readonly MediaCharacter[],
  existingIds: ReadonlySet<number>,
  selection: MediaSelection,
): { kept: MediaCharacter[]; skipped: MediaSkip[]; missingIds: number[] } {
  const wanted = new Set(selection.ids);
  const seen = new Set<number>();
  const kept: MediaCharacter[] = [];
  const skipped: MediaSkip[] = [];
  const sorted = [...characters].sort((a, b) => b.character.favorites - a.character.favorites || a.character.anilistId - b.character.anilistId);
  for (const c of sorted) {
    const { anilistId, name } = c.character;
    if (wanted.size > 0 && !wanted.has(anilistId)) continue;
    if (seen.has(anilistId)) { skipped.push({ anilistId, name, reason: "duplicate" }); continue; }
    seen.add(anilistId);
    if (existingIds.has(anilistId)) { skipped.push({ anilistId, name, reason: "existing" }); continue; }
    if (wanted.size === 0) {
      if (!c.mediaRole || !selection.roles.includes(c.mediaRole)) { skipped.push({ anilistId, name, reason: "role" }); continue; }
      if (c.character.favorites < selection.minFavorites) { skipped.push({ anilistId, name, reason: "favorites" }); continue; }
    }
    if (selection.limit !== null && kept.length >= selection.limit) { skipped.push({ anilistId, name, reason: "limit" }); continue; }
    kept.push(c);
  }
  return { kept, skipped, missingIds: [...wanted].filter((id) => !seen.has(id)) };
}

/** Valeur médiane (arrondie) d'une liste non vide. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Rareté et stats des nouveaux personnages, sans toucher au catalogue :
 * - rang virtuel = 1 + nombre de cartes classées qui ont plus de favoris ; la rareté et les stats en
 *   découlent comme à l'import complet (rarityForRank, statsFor) ;
 * - rareté imposée : stats médianes des cartes classées de cette rareté (repli : stats du rang virtuel) ;
 * - rang stocké (unique) : à la suite du dernier rang, comme --preserve-existing.
 */
export function placeNewCharacters(
  kept: readonly MediaCharacter[],
  catalog: readonly CatalogCard[],
  opts: { thresholds: RarityThresholds; stats: StatCoefficients; forced: ReadonlyMap<number, Rarity> },
): MediaEntry[] {
  const ranked = catalog.filter((c) => c.rank !== null);
  const total = ranked.length + kept.length;
  let nextRank = catalog.reduce((max, c) => Math.max(max, c.rank ?? 0), 0);
  return kept.map((c) => {
    const virtual = 1 + ranked.filter((r) => r.favorites > c.character.favorites).length;
    const forced = opts.forced.get(c.character.anilistId);
    const peers = forced ? ranked.filter((r) => r.rarity === forced) : [];
    const stats = peers.length > 0
      ? { power: median(peers.map((p) => p.power)), ki: median(peers.map((p) => p.ki)) }
      : statsFor(virtual, total, opts.stats);
    return {
      character: c.character,
      mediaRole: c.mediaRole,
      rank: ++nextRank,
      rarity: forced ?? rarityForRank(virtual, total, opts.thresholds),
      ...stats,
      forced: forced !== undefined,
    };
  });
}
