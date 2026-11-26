import { scorePairs, type DetectionInput, type Reason } from "@/lib/anticheat/score";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import type { ReferralV2Rules } from "./rules";

// Mise « À vérifier » d'un parrainage v2. Un appareil commun (même cookie kiraku.device chez le parrain et le filleul,
// ou chez deux filleuls du même parrain) bloque tout de suite. Sinon, le score de la paire, recalculé avant chaque
// grosse récompense, bloque à partir de holdScore. Le score reprend lib/anticheat/score.ts sans les indices
// « referral » (toujours présent, par définition) ni « onlyFriend » (le parrain est souvent le seul ami d'un nouveau
// joueur). Les IP vues sur plus de sharedCap comptes sont retirées par l'appelant, qui les compte sur tout le serveur.
// Barème : réglage multiAccount.scoring, transmis par l'appelant (absent : barème d'origine).

export type PairPerson = DetectionInput["users"][number];

export type PairScoreInput = {
  referrer: PairPerson;
  referee: PairPerson;
  signals: DetectionInput["signals"];
  transfers: DetectionInput["transfers"];
  sharedCap: number;
  scoring?: DetectionScoring;
};

export function referralPairScore(input: PairScoreInput): { score: number; reasons: Reason[] } {
  const ids = new Set([input.referrer.id, input.referee.id]);
  const [pair] = scorePairs({
    users: [input.referrer, input.referee],
    signals: input.signals.filter((s) => ids.has(s.userId)),
    referrals: [],
    onlyFriends: [],
    transfers: input.transfers.filter((t) => ids.has(t.fromId) && ids.has(t.toId)),
    sharedCap: input.sharedCap,
    minScore: 0,
    scoring: input.scoring,
  });
  return pair ? { score: pair.score, reasons: pair.reasons } : { score: 0, reasons: [] };
}

export type HoldReason = "DEVICE" | "SCORE";

/** Motif de mise « À vérifier », ou null. `score` : null s'il n'a pas encore été calculé. */
export function holdReason(input: { sharedDevice: boolean; score: number | null }, rules: Pick<ReferralV2Rules, "holdScore">): HoldReason | null {
  if (input.sharedDevice) return "DEVICE";
  if (input.score !== null && input.score >= rules.holdScore) return "SCORE";
  return null;
}

/** Un score calculé il y a moins de scoreTtlHours heures peut servir à un versement. */
export function scoreIsFresh(scoredAt: Date | null, now: Date, rules: Pick<ReferralV2Rules, "scoreTtlHours">): boolean {
  return scoredAt !== null && now.getTime() - scoredAt.getTime() < rules.scoreTtlHours * 3_600_000;
}
