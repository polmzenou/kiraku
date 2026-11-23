import type { KyaraImportStatus, KyaraRejectCode } from "./codes";
import type { KyaraEligibility, KyaraIneligibility } from "./window";

// Ce que voit le joueur sur /compte/import-kyara, à partir de son éligibilité et de sa dernière demande.
// Une demande en cours ou versée reste visible même si l'import est coupé ou la fenêtre passée.

export type KyaraRow = {
  status: KyaraImportStatus;
  rejectCode: KyaraRejectCode | null;
};

export type KyaraClosedReason = Extract<KyaraIneligibility, "UNAVAILABLE" | "EXPIRED" | "NO_DISCORD"> | "DISCORD_USED";

export type PlayerKyaraPhase =
  | { kind: "HIDDEN" }
  | { kind: "SOON"; opensAt: number | null }
  | { kind: "GUEST" }
  | { kind: "CLOSED"; reason: KyaraClosedReason; deadline: number | null }
  | { kind: "OPEN"; deadline: number | null }
  | { kind: "PENDING" }
  | { kind: "READY" }
  | { kind: "REJECTED"; code: KyaraRejectCode | null; canRetry: boolean; deadline: number | null }
  | { kind: "DONE" };

/**
 * `latest` : la dernière demande du joueur (la plus récente), ou null. `discordUsedElsewhere` : son compte Discord
 * a déjà servi à une demande en cours ou versée d'un autre compte (supprimé compris).
 */
export function playerKyaraPhase(e: KyaraEligibility, latest: KyaraRow | null, discordUsedElsewhere: boolean): PlayerKyaraPhase {
  if (latest?.status === "DONE") return { kind: "DONE" };
  if (latest?.status === "PENDING") return { kind: "PENDING" };
  if (latest?.status === "READY") return { kind: "READY" };
  if (latest?.status === "REJECTED") {
    return { kind: "REJECTED", code: latest.rejectCode, canRetry: e.ok && !discordUsedElsewhere, deadline: e.deadline };
  }
  if (e.ok) return discordUsedElsewhere ? { kind: "CLOSED", reason: "DISCORD_USED", deadline: e.deadline } : { kind: "OPEN", deadline: e.deadline };
  switch (e.reason) {
    case "DISABLED":
      return { kind: "HIDDEN" };
    case "NOT_LAUNCHED":
      return { kind: "SOON", opensAt: e.opensAt };
    case "GUEST":
      return { kind: "GUEST" };
    default:
      return { kind: "CLOSED", reason: e.reason, deadline: e.deadline };
  }
}

/** Bannière de l'accueil : seulement quand le joueur peut agir (s'inscrire, lier Discord ou demander). */
export function showKyaraBanner(phase: PlayerKyaraPhase): boolean {
  return phase.kind === "OPEN" || phase.kind === "GUEST" || (phase.kind === "CLOSED" && phase.reason === "NO_DISCORD");
}

/** Tuile du Compte : tant qu'il y a quelque chose à faire ou à relire. */
export function showKyaraTile(phase: PlayerKyaraPhase): boolean {
  if (phase.kind === "HIDDEN" || phase.kind === "SOON" || phase.kind === "GUEST") return false;
  if (phase.kind === "CLOSED") return phase.reason === "NO_DISCORD";
  return true;
}
