import { cleanPlainText } from "../text/plain";

// Regroupement des séries en univers à partir des relations AniList (npm run catalog:universes). Pur :
// le script fournit les séries et les relations, /admin/univers corrige ensuite.

export const UNIVERSE_NAME_MAX = 80;

/**
 * Relations qui veulent dire « même histoire ». SPIN_OFF et ALTERNATIVE sont exclues : testées sur le
 * catalogue, elles fusionnent des œuvres sans lien (tous les Precure, tous les Love Live). CHARACTER
 * et OTHER aussi : un simple personnage invité ne fait pas un univers.
 */
export const UNIVERSE_RELATIONS: ReadonlySet<string> = new Set([
  "SEQUEL",
  "PREQUEL",
  "PARENT",
  "SIDE_STORY",
  "ADAPTATION",
  "SOURCE",
  "SUMMARY",
  "COMPILATION",
  "CONTAINS",
]);

export type RelationEdge = { from: number; to: number; type: string };
export type UniverseSeries = { id: string; anilistId: number | null; titleRomaji: string; universeId: string | null };

/**
 * Composantes connexes des séries reliées par une relation retenue. Une œuvre absente du catalogue sert
 * d'intermédiaire : deux animés adaptés du même manga non importé finissent ensemble. Les séries sans
 * `anilistId` (cartes créées à la main) n'ont aucune relation et restent hors des groupes.
 */
export function groupSeries<T extends { anilistId: number | null }>(series: readonly T[], edges: readonly RelationEdge[]): T[][] {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    // Compression de chemin : la suite des appels reste en temps quasi constant
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const s of series) if (s.anilistId !== null && !parent.has(s.anilistId)) parent.set(s.anilistId, s.anilistId);
  for (const e of edges) {
    if (!UNIVERSE_RELATIONS.has(e.type)) continue;
    for (const id of [e.from, e.to]) if (!parent.has(id)) parent.set(id, id);
    union(e.from, e.to);
  }
  const groups = new Map<number, T[]>();
  for (const s of series) {
    if (s.anilistId === null) continue;
    const root = find(s.anilistId);
    const group = groups.get(root);
    if (group) group.push(s);
    else groups.set(root, [s]);
  }
  return [...groups.values()];
}

/** Nom proposé pour un groupe : le titre romaji le plus court (« Jujutsu Kaisen » plutôt que sa saison 2), renommable ensuite. */
export function universeName(group: readonly { titleRomaji: string }[]): string {
  const best = [...group].map((s) => s.titleRomaji.trim()).sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "";
  return [...best].slice(0, UNIVERSE_NAME_MAX).join("").trim();
}

/** Nom saisi dans l'admin, prêt à enregistrer, ou null s'il est vide ou trop long. */
export function cleanUniverseName(raw: string): string | null {
  const name = cleanPlainText(raw.replace(/\s+/g, " ")).replace(/ {2,}/g, " ");
  return name.length === 0 || [...name].length > UNIVERSE_NAME_MAX ? null : name;
}

export type UniversePlan = {
  /** Nouveaux univers, seulement pour au moins deux séries : une série seule forme déjà son propre univers. */
  create: { name: string; series: UniverseSeries[] }[];
  /** Séries sans univers reliées à un seul univers existant : elles le rejoignent. */
  join: { universeId: string; series: UniverseSeries[] }[];
  /** Séries sans univers reliées à plusieurs univers existants : laissées telles quelles, à trancher dans l'admin. */
  conflicts: { universeIds: string[]; series: UniverseSeries[] }[];
  /** Séries sans univers et sans `anilistId` : à ranger à la main. */
  withoutAnilist: UniverseSeries[];
};

/**
 * Ce que le script écrirait. Ne déplace jamais une série déjà rangée : les corrections de l'admin
 * survivent aux relances. Une série retirée d'un univers par l'admin en reçoit un à elle seule, et n'est
 * donc pas replacée ici.
 */
export function planUniverses(series: readonly UniverseSeries[], edges: readonly RelationEdge[]): UniversePlan {
  const plan: UniversePlan = { create: [], join: [], conflicts: [], withoutAnilist: series.filter((s) => s.anilistId === null && s.universeId === null) };
  for (const group of groupSeries(series, edges)) {
    const free = group.filter((s) => s.universeId === null);
    if (free.length === 0) continue;
    const existing = [...new Set(group.flatMap((s) => s.universeId ?? []))];
    if (existing.length > 1) plan.conflicts.push({ universeIds: existing, series: free });
    else if (existing.length === 1) plan.join.push({ universeId: existing[0], series: free });
    else if (free.length > 1) plan.create.push({ name: universeName(free), series: free });
  }
  return plan;
}
