import { cellCount, columnPositions, rowPositions, type Grid } from "./grid";

// Progression d'une fresque et récompenses gagnées, sans base. Chaque récompense se verse une seule fois :
// le serveur insère (joueur, fresque, type, index) avec une clé unique, ce calcul ne fait que proposer.

export const FRESCO_REWARD_KINDS = ["PIECE", "ROW", "COLUMN", "COMPLETE"] as const;
export type FrescoRewardKind = (typeof FRESCO_REWARD_KINDS)[number];

/** index : position du fragment, numéro de ligne ou de colonne (à partir de 0), 0 pour la fresque complète. */
export type EarnedReward = { kind: FrescoRewardKind; index: number };

export function completedRows(owned: ReadonlySet<number>, grid: Grid): number[] {
  return Array.from({ length: grid.rows }, (_, row) => row).filter((row) => rowPositions(row, grid).every((p) => owned.has(p)));
}

export function completedColumns(owned: ReadonlySet<number>, grid: Grid): number[] {
  return Array.from({ length: grid.cols }, (_, col) => col).filter((col) => columnPositions(col, grid).every((p) => owned.has(p)));
}

export function isComplete(owned: ReadonlySet<number>, grid: Grid): boolean {
  return owned.size >= cellCount(grid) && Array.from({ length: cellCount(grid) }, (_, p) => p).every((p) => owned.has(p));
}

/** Positions encore manquantes, dans l'ordre. */
export function missingPositions(owned: ReadonlySet<number>, grid: Grid): number[] {
  return Array.from({ length: cellCount(grid) }, (_, p) => p).filter((p) => !owned.has(p));
}

/**
 * Ce que rapportent les fragments `added` à un joueur qui avait `before` : chaque fragment nouveau, puis les
 * lignes et colonnes qui se remplissent, puis la fresque entière. Un fragment déjà possédé ne rapporte rien.
 */
export function earnedRewards(before: ReadonlySet<number>, added: readonly number[], grid: Grid): EarnedReward[] {
  const after = new Set(before);
  const out: EarnedReward[] = [];
  for (const p of added) {
    if (after.has(p)) continue;
    after.add(p);
    out.push({ kind: "PIECE", index: p });
  }
  if (out.length === 0) return out;
  const rowsBefore = new Set(completedRows(before, grid));
  const colsBefore = new Set(completedColumns(before, grid));
  for (const row of completedRows(after, grid)) if (!rowsBefore.has(row)) out.push({ kind: "ROW", index: row });
  for (const col of completedColumns(after, grid)) if (!colsBefore.has(col)) out.push({ kind: "COLUMN", index: col });
  if (!isComplete(before, grid) && isComplete(after, grid)) out.push({ kind: "COMPLETE", index: 0 });
  return out;
}

/** Identifiant de journal d'un versement (CoinTransaction.refId, LotGrant). */
export function rewardRef(frescoId: string, reward: EarnedReward): string {
  return `${frescoId}:${reward.kind}:${reward.index}`;
}
