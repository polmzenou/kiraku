// Moteur de l'import AniList, partagé par scripts/import-characters.mts et (plus tard) l'admin.
// Volontairement sans "server-only" ni server/db.ts : base, fetch et horloge sont injectés,
// ce qui permet de le lancer hors de Next et de le tester sans réseau ni base. Aucun secret ici.

import {
  ANILIST_ENDPOINT,
  CHARACTERS_QUERY,
  ANILIST_MAX_DEPTH,
  normalizeCharacter,
  pageResponseSchema,
  pageWindow,
  type ImportedCharacter,
  type SkipReason,
} from "@/lib/catalog/anilist";
import { nextDelay } from "@/lib/catalog/pacing";
import {
  countByRarity,
  rankCatalog,
  type Rarity,
  type RankedEntry,
  type RarityPolicy,
  type RarityThresholds,
  type StatCoefficients,
} from "@/lib/catalog/rarity";

export type ImportRunStatus = "RUNNING" | "FINALIZED" | "ABANDONED" | "FAILED";
export type ImportRun = { id: string; status: ImportRunStatus; target: number; lastPage: number; kept: number };
export type StagedRow = { anilistId: number; position: number; favorites: number; data: ImportedCharacter };
export type FinalEntry = RankedEntry<StagedRow>;
export type CatalogSnapshotRow = { anilistId: number; rank: number | null; rarity: Rarity };

/** Stockage de l'import : Prisma en vrai (prisma-store.ts), mémoire pour le dry-run et les tests. */
export interface ImportStore {
  /** Import interrompu ou en échec pour ce même objectif, à reprendre. */
  findResumable(target: number): Promise<ImportRun | null>;
  /** Crée un import et abandonne tous les autres imports non finalisés. */
  createRun(target: number): Promise<ImportRun>;
  /** Abandonne tous les imports non finalisés (--fresh). */
  abandonUnfinished(): Promise<void>;
  /** Dernier import non abandonné (--finalize-only). */
  latestRun(): Promise<ImportRun | null>;
  /** Enregistre une page en une transaction : lignes (upsert), lastPage, kept. */
  savePage(runId: string, page: number, rows: StagedRow[]): Promise<{ kept: number }>;
  /** Ids déjà récupérés avant cette position (exclusion des fenêtres précédentes). */
  stagedIdsBefore(runId: string, position: number): Promise<number[]>;
  markFailed(runId: string, error: string): Promise<void>;
  loadRows(runId: string): Promise<StagedRow[]>;
  catalogSnapshot(): Promise<CatalogSnapshotRow[]>;
  /** Écrit le catalogue final en une transaction et marque l'import FINALIZED. */
  finalize(runId: string, entries: FinalEntry[]): Promise<void>;
}

export type ImportSettings = {
  perPage: number;
  requestDelayMs: number;
  minTagRank: number;
  thresholds: RarityThresholds;
  stats: StatCoefficients;
  policy: RarityPolicy;
};

export type ImportDeps = {
  store: ImportStore;
  settings: ImportSettings;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  /** Vrai quand l'utilisateur demande l'arrêt (Ctrl+C) : on s'arrête entre deux pages. */
  shouldStop?: () => boolean;
  /** Profondeur maximale de pagination d'AniList (réduite dans les tests). */
  maxDepth?: number;
};

export type FinalizeReport = {
  total: number;
  inserted: number;
  rankChanged: number;
  rarityChanged: number;
  removed: number;
  byRarity: Record<Rarity, number>;
  top: { rank: number; anilistId: number; name: string; rarity: Rarity }[];
};

export type ImportResult =
  | { status: "finalized"; runId: string; pagesFetched: number; skipped: Record<SkipReason, number>; report: FinalizeReport; entries: FinalEntry[] }
  | { status: "interrupted"; runId: string; lastPage: number; kept: number }
  | { status: "failed"; runId: string; lastPage: number; error: string };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const FETCH_TIMEOUT_MS = 30_000;

type PageResult = { ok: true; characters: unknown[]; hasNextPage: boolean; delayMs: number } | { ok: false; error: string };

type FetchDeps = Required<Omit<ImportDeps, "store" | "maxDepth">>;

/** `page` : page dans la fenêtre courante ; `label` : page globale, pour les messages. */
async function fetchPage(page: number, exclude: number[], deps: FetchDeps, label: number): Promise<PageResult> {
  const { settings, log, sleep } = deps;
  const variables = { page, perPage: settings.perPage, ...(exclude.length > 0 && { exclude }) };
  for (let attempt = 1; ; attempt++) {
    let status: number | null = null;
    let retryAfter: string | null = null;
    let remaining: string | null = null;
    let detail = "erreur réseau";
    let parsed: ReturnType<typeof pageResponseSchema.safeParse> | null = null;
    try {
      const res = await deps.fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: CHARACTERS_QUERY, variables }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      status = res.status;
      retryAfter = res.headers.get("retry-after");
      remaining = res.headers.get("x-ratelimit-remaining");
      detail = `HTTP ${res.status}`;
      if (res.ok) {
        parsed = pageResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { ok: false, error: `réponse inattendue d'AniList (page ${label})` };
      } else {
        // Message d'erreur GraphQL d'AniList, pour comprendre un 400
        const body: unknown = await res.json().catch(() => null);
        const message = (body as { errors?: { message?: unknown }[] } | null)?.errors?.[0]?.message;
        if (typeof message === "string") detail += ` « ${message.slice(0, 200)} »`;
      }
    } catch {
      status = null;
    }

    const decision = nextDelay({ status, retryAfter, remaining, attempt, baseDelayMs: settings.requestDelayMs });
    if (decision.action === "continue" && parsed?.success) {
      const { characters, pageInfo } = parsed.data.data.Page;
      return { ok: true, characters, hasNextPage: pageInfo?.hasNextPage ?? false, delayMs: decision.delayMs };
    }
    if (decision.action !== "retry") return { ok: false, error: `${detail} (page ${label}, essai ${attempt})` };
    log(`  ${detail} sur la page ${label}, nouvel essai dans ${Math.round(decision.delayMs / 1000)} s`);
    await sleep(decision.delayMs);
  }
}

/** Compare le catalogue avant/après pour le rapport (et le contrôle d'idempotence). */
export function diffReport(before: CatalogSnapshotRow[], entries: FinalEntry[]): FinalizeReport {
  const prev = new Map(before.map((c) => [c.anilistId, c]));
  const next = new Set(entries.map((e) => e.anilistId));
  let inserted = 0;
  let rankChanged = 0;
  let rarityChanged = 0;
  for (const e of entries) {
    const old = prev.get(e.anilistId);
    if (!old) inserted++;
    else {
      if (old.rank !== e.rank) rankChanged++;
      if (old.rarity !== e.rarity) rarityChanged++;
    }
  }
  const removed = before.filter((c) => c.rank !== null && !next.has(c.anilistId)).length;
  return {
    total: entries.length,
    inserted,
    rankChanged,
    rarityChanged,
    removed,
    byRarity: countByRarity(entries),
    top: entries.slice(0, 10).map((e) => ({ rank: e.rank, anilistId: e.anilistId, name: e.data.name, rarity: e.rarity })),
  };
}

/** Phase B : classe le staging et écrit le catalogue. Idempotente pour un même staging. */
export async function finalizeRun(store: ImportStore, run: ImportRun, settings: ImportSettings) {
  const [rows, before] = await Promise.all([store.loadRows(run.id), store.catalogSnapshot()]);
  const existingRarity = new Map(before.map((c) => [c.anilistId, c.rarity]));
  const entries = rankCatalog(rows, {
    target: run.target,
    thresholds: settings.thresholds,
    stats: settings.stats,
    policy: settings.policy,
    existingRarity,
  });
  const report = diffReport(before, entries);
  await store.finalize(run.id, entries);
  return { report, entries };
}

/**
 * Import complet : reprise ou création, récupération page par page (phase A), puis finalisation (phase B).
 * On récupère une page de marge au-delà de l'objectif : un personnage peut changer de page pendant l'import.
 */
export async function runImport(
  deps: ImportDeps & { target: number; fresh?: boolean },
): Promise<ImportResult> {
  const full = {
    settings: deps.settings,
    fetch: deps.fetch ?? fetch,
    sleep: deps.sleep ?? defaultSleep,
    log: deps.log ?? (() => {}),
    shouldStop: deps.shouldStop ?? (() => false),
  };
  const { store } = deps;
  const { settings, log } = full;
  const maxDepth = deps.maxDepth ?? ANILIST_MAX_DEPTH;

  if (deps.fresh) await store.abandonUnfinished();
  const resumed = await store.findResumable(deps.target);
  const run = resumed ?? (await store.createRun(deps.target));
  log(
    resumed
      ? `Reprise de l'import ${run.id} à la page ${run.lastPage + 1} (${run.kept} personnages déjà récupérés)`
      : `Nouvel import ${run.id} : objectif ${run.target} personnages`,
  );

  const goal = run.target + settings.perPage;
  const skipped: Record<SkipReason, number> = { invalid: 0, noMedia: 0, noName: 0, badImage: 0 };
  let kept = run.kept;
  let page = run.lastPage + 1;
  let pagesFetched = 0;
  let more = true;
  let excluded = null as { window: number; ids: number[] } | null;

  while (kept < goal && more) {
    if (full.shouldStop()) {
      log(`Arrêt demandé : reprise possible à la page ${page}.`);
      return { status: "interrupted", runId: run.id, lastPage: page - 1, kept };
    }

    const win = pageWindow(page, settings.perPage, maxDepth);
    if (excluded?.window !== win.index) {
      const ids: number[] = win.index === 0 ? [] : await store.stagedIdsBefore(run.id, win.firstPosition);
      excluded = { window: win.index, ids };
      if (win.index > 0) log(`Fenêtre ${win.index + 1} : ${ids.length} personnages déjà récupérés exclus (limite AniList de ${maxDepth})`);
    }

    const result = await fetchPage(win.localPage, excluded.ids, full, page);
    if (!result.ok) {
      await store.markFailed(run.id, result.error);
      log(`Échec : ${result.error}. Relance la même commande pour reprendre.`);
      return { status: "failed", runId: run.id, lastPage: page - 1, error: result.error };
    }

    const rows: StagedRow[] = [];
    result.characters.forEach((raw, i) => {
      const n = normalizeCharacter(raw, settings.minTagRank);
      if (!n.ok) skipped[n.reason]++;
      else rows.push({ anilistId: n.character.anilistId, position: (page - 1) * settings.perPage + i, favorites: n.character.favorites, data: n.character });
    });
    ({ kept } = await store.savePage(run.id, page, rows));
    pagesFetched++;
    more = result.hasNextPage && result.characters.length > 0;
    log(`Page ${page} : ${rows.length}/${result.characters.length} gardés, ${kept}/${goal} au total`);
    page++;

    if (kept < goal && more) await full.sleep(result.delayMs);
  }

  const { report, entries } = await finalizeRun(store, run, settings);
  return { status: "finalized", runId: run.id, pagesFetched, skipped, report, entries };
}
