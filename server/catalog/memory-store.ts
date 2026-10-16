// Stockage en mémoire de l'import : sert au --dry-run (aucune écriture en base) et aux tests.

import type { CatalogSnapshotRow, FinalEntry, ImportRun, ImportStore, StagedRow } from "./import";
import { preserveExistingEntries } from "./import";
import { RUN_NOT_ACTIVE } from "./run-guard";

export type MemoryCard = Omit<FinalEntry, "rank"> & { id: string; rank: number | null };

export type MemoryStore = ImportStore & {
  runs: Map<string, ImportRun>;
  rows: Map<string, Map<number, StagedRow>>;
  /** Catalogue écrit par finalize, par anilistId (id stable comme en base). */
  cards: Map<number, MemoryCard>;
  savedPages: number[];
};

export function memoryImportStore(initialCards: CatalogSnapshotRow[] = []): MemoryStore {
  const runs = new Map<string, ImportRun>();
  const rows = new Map<string, Map<number, StagedRow>>();
  const cards = new Map<number, MemoryCard>();
  const snapshotSeed = new Map(initialCards.map((c) => [c.anilistId, c]));
  const savedPages: number[] = [];
  let seq = 0;

  const unfinished = () => [...runs.values()].filter((r) => r.status === "RUNNING" || r.status === "FAILED");

  return {
    runs,
    rows,
    cards,
    savedPages,
    async findResumable(target) {
      const run = unfinished().filter((r) => r.target === target).at(-1);
      if (!run) return null;
      run.status = "RUNNING";
      return { ...run };
    },
    async createRun(target) {
      for (const r of unfinished()) r.status = "ABANDONED";
      const run: ImportRun = { id: `run-${++seq}`, status: "RUNNING", target, lastPage: 0, kept: 0 };
      runs.set(run.id, run);
      rows.set(run.id, new Map());
      return { ...run };
    },
    async abandonUnfinished() {
      for (const r of unfinished()) r.status = "ABANDONED";
    },
    async latestRun() {
      const run = [...runs.values()].filter((r) => r.status !== "ABANDONED").at(-1);
      return run ? { ...run } : null;
    },
    async savePage(runId, page, pageRows) {
      if (runs.get(runId)?.status !== "RUNNING") throw new Error(RUN_NOT_ACTIVE);
      const staged = rows.get(runId)!;
      for (const row of pageRows) staged.set(row.anilistId, row);
      const run = runs.get(runId)!;
      run.lastPage = page;
      run.kept = staged.size;
      savedPages.push(page);
      return { kept: staged.size };
    },
    async stagedIdsBefore(runId, position) {
      return [...(rows.get(runId)?.values() ?? [])].filter((r) => r.position < position).map((r) => r.anilistId);
    },
    async markFailed(runId) {
      runs.get(runId)!.status = "FAILED";
    },
    async loadRows(runId) {
      return [...(rows.get(runId)?.values() ?? [])];
    },
    async catalogSnapshot() {
      const snapshot = new Map(snapshotSeed);
      for (const card of cards.values()) snapshot.set(card.anilistId, { anilistId: card.anilistId, rank: card.rank, rarity: card.rarity, power: card.power, ki: card.ki });
      return [...snapshot.values()];
    },
    async finalize(runId, entries, options) {
      const status = runs.get(runId)?.status;
      if (status !== "RUNNING" && status !== "FINALIZED") throw new Error(RUN_NOT_ACTIVE);
      if (options?.preserveExisting) {
        const snapshot = new Map(snapshotSeed);
        for (const card of cards.values()) snapshot.set(card.anilistId, card);
        const before = [...snapshot.values()];
        entries = preserveExistingEntries(entries, before, options.target ?? before.filter((card) => card.rank !== null).length + entries.length);
      }
      const ranked = new Set(entries.map((e) => e.anilistId));
      if (!options?.preserveExisting) {
        for (const [id, card] of cards) if (!ranked.has(id)) cards.set(id, { ...card, rank: null });
        for (const [id, card] of snapshotSeed) if (!ranked.has(id)) snapshotSeed.set(id, { ...card, rank: null });
      }
      for (const e of entries) cards.set(e.anilistId, { ...e, id: cards.get(e.anilistId)?.id ?? `card-${e.anilistId}` });
      runs.get(runId)!.status = "FINALIZED";
      for (const [id] of rows) if (id !== runId) rows.delete(id);
    },
  };
}
