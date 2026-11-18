import type { CoinFlipStatus } from "./coinflip";
import { otherSide, type CoinSide } from "./fairness";

// Ce que le client reçoit d'une table. La graine reste sur le serveur tant que la table n'est pas jouée :
// la révéler plus tôt donnerait l'issue à qui sait calculer un HMAC.

export type CoinFlipRow = {
  id: string;
  status: CoinFlipStatus;
  creatorId: string;
  creatorSide: CoinSide;
  tierOrder: number;
  reservedForId: string | null;
  opponentId: string | null;
  seed: string;
  seedHash: string;
  result: CoinSide | null;
  winnerId: string | null;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
};

export type CoinFlipProofView = {
  seedHash: string;
  /** Révélée une fois la table jouée seulement. */
  seed: string | null;
};

export type CoinFlipCoreView = Omit<CoinFlipRow, "seed" | "createdAt" | "expiresAt" | "resolvedAt"> & {
  seed: string | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
};

/** Seule une table DONE révèle sa graine. */
export function revealedSeed(row: Pick<CoinFlipRow, "status" | "seed">): string | null {
  return row.status === "DONE" ? row.seed : null;
}

export function coreView(row: CoinFlipRow): CoinFlipCoreView {
  return {
    id: row.id,
    status: row.status,
    creatorId: row.creatorId,
    creatorSide: row.creatorSide,
    tierOrder: row.tierOrder,
    reservedForId: row.reservedForId,
    opponentId: row.opponentId,
    seed: revealedSeed(row),
    seedHash: row.seedHash,
    result: row.status === "DONE" ? row.result : null,
    winnerId: row.status === "DONE" ? row.winnerId : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** Face jouée par un joueur de la table, ou null s'il n'y est pas assis. */
export function sideOf(row: Pick<CoinFlipRow, "creatorId" | "creatorSide" | "opponentId">, userId: string): CoinSide | null {
  if (row.creatorId === userId) return row.creatorSide;
  if (row.opponentId === userId) return otherSide(row.creatorSide);
  return null;
}

export type FlipOutcomeForViewer = "won" | "lost" | null;

/** Issue pour celui qui regarde : null si la table n'est pas jouée ou s'il n'y était pas. */
export function outcomeFor(row: Pick<CoinFlipRow, "status" | "creatorId" | "opponentId" | "winnerId">, userId: string): FlipOutcomeForViewer {
  if (row.status !== "DONE" || row.winnerId === null) return null;
  if (row.creatorId !== userId && row.opponentId !== userId) return null;
  return row.winnerId === userId ? "won" : "lost";
}

export type FlipStats = { played: number; won: number; lost: number; omote: number; ura: number; streak: number };

/**
 * Statistiques personnelles sur les tables jouées, de la plus récente à la plus ancienne :
 * victoires, défaites, faces sorties, et série en cours (positive en victoires, négative en défaites).
 */
export function flipStats(rows: readonly Pick<CoinFlipRow, "status" | "creatorId" | "opponentId" | "winnerId" | "result">[], userId: string): FlipStats {
  const stats: FlipStats = { played: 0, won: 0, lost: 0, omote: 0, ura: 0, streak: 0 };
  let streakOpen = true;
  for (const row of rows) {
    const outcome = outcomeFor(row, userId);
    if (outcome === null) continue;
    stats.played += 1;
    if (outcome === "won") stats.won += 1;
    else stats.lost += 1;
    if (row.result === "OMOTE") stats.omote += 1;
    else if (row.result === "URA") stats.ura += 1;
    if (streakOpen) {
      const step = outcome === "won" ? 1 : -1;
      if (stats.streak === 0 || Math.sign(stats.streak) === step) stats.streak += step;
      else streakOpen = false;
    }
  }
  return stats;
}

/** Ce qui fait bouger « Mes tables » et le bandeau des replays : une table posée, relevée, retirée, échue, une invitation. */
export type MineState = {
  mine: readonly Pick<CoinFlipRow, "id" | "status">[];
  invitations: readonly Pick<CoinFlipRow, "id">[];
  replays: readonly Pick<CoinFlipRow, "id">[];
};

/**
 * Empreinte de l'état des tables du joueur, comparée par le salon à celle du rendu serveur : différente, la
 * page se recharge (sans dépendre de l'ordre des lignes).
 */
export function mineSignature(state: MineState): string {
  const ids = (rows: readonly { id: string; status?: string }[]) =>
    rows
      .map((r) => (r.status ? `${r.id}:${r.status}` : r.id))
      .sort()
      .join(",");
  return `m=${ids(state.mine)}|i=${ids(state.invitations)}|r=${ids(state.replays)}`;
}
