import { milestonePays, reachedMilestones } from "./ladder";
import type { ReferralMilestone, ReferralV2Rules } from "./rules";
import type { StepTimes } from "./steps";
import { trustPartDue, type Trust } from "./trust";

// Ce qu'un parrainage v2 doit verser et n'a pas encore versé : étapes des deux côtés, part « confiance » du parrain,
// paliers du parrain, grand-parrainage. Pur : server/referral/payout-core.ts lit l'état, appelle planPayouts, puis verse
// chaque récompense dans sa transaction (l'index unique de ReferralReward empêche tout double versement).

export type RewardKind = "STEP" | "TRUST_BONUS" | "MILESTONE" | "GRAND";
export type RewardSide = "REFEREE" | "REFERRER";

/** Versement déjà fait (lignes ReferralReward du parrainage, et paliers du parrain non repris). */
export type PaidReward = { kind: RewardKind; side: RewardSide | null; step: number | null; milestone: number | null };

export type DueReward = {
  kind: RewardKind;
  side: RewardSide | null;
  step: number | null;
  milestone: ReferralMilestone | null;
  /** Bénéficiaire, et l'autre joueur (acteur de la notification). */
  userId: string;
  actorId: string;
  lotId: string | null;
  multiplier: number;
  /** Exige un score de paire récent : étapes 3 et 4, part « confiance » qui attendait l'étape 3, paliers. */
  big: boolean;
  /** Part « confiance » versée avec son étape : une seule notification, celle de l'étape. */
  quiet: boolean;
};

export type PayoutInput = {
  referral: {
    referrerId: string;
    refereeId: string;
    grandReferrerId: string | null;
    /**
     * Arrivé pendant une édition de l'Ennichi : multiplicateur des étapes 1 et 2 figé au rattachement (null hors fête).
     * Un réglage changé ensuite ne touche plus ce parrainage, même pour une étape ou une validation tardive.
     */
    ennichiMultiplier: number | null;
    times: StepTimes;
    trust: Trust;
  };
  paid: readonly PaidReward[];
  /** Paliers du parrain déjà versés (non repris), en amis installés. */
  paidMilestones: readonly number[];
  /** Amis installés du parrain (comptés : ni révoqués, ni bloqués sans décision). */
  installed: number;
  /** Le grand-parrain peut toucher (son parrainage du parrain n'est pas révoqué, son compte n'est pas banni). */
  grandAllowed: boolean;
};

export function planPayouts(input: PayoutInput, rules: Pick<ReferralV2Rules, "stepLots" | "grandLotId" | "milestones">): DueReward[] {
  const { referral } = input;
  const done = (kind: RewardKind, side: RewardSide | null, step: number | null) =>
    input.paid.some((p) => p.kind === kind && p.side === side && p.step === step);
  const due: DueReward[] = [];
  const base = { milestone: null, quiet: false };

  referral.times.forEach((at, i) => {
    if (!at) return;
    const step = i + 1;
    const lots = rules.stepLots[i];
    const multiplier = referral.ennichiMultiplier !== null && step <= 2 ? Math.max(1, referral.ennichiMultiplier) : 1;
    const big = step >= 3;
    if (lots.referee && !done("STEP", "REFEREE", step)) {
      due.push({ ...base, kind: "STEP", side: "REFEREE", step, userId: referral.refereeId, actorId: referral.referrerId, lotId: lots.referee, multiplier, big });
    }
    const referrerStepDue = lots.referrer !== null && !done("STEP", "REFERRER", step);
    if (referrerStepDue) {
      due.push({ ...base, kind: "STEP", side: "REFERRER", step, userId: referral.referrerId, actorId: referral.refereeId, lotId: lots.referrer, multiplier, big });
    }
    if ((step === 1 || step === 2) && lots.referrerTrust && trustPartDue(step, referral.times, referral.trust) && !done("TRUST_BONUS", "REFERRER", step)) {
      due.push({
        ...base,
        kind: "TRUST_BONUS",
        side: "REFERRER",
        step,
        userId: referral.referrerId,
        actorId: referral.refereeId,
        lotId: lots.referrerTrust,
        multiplier,
        big: referral.trust === "MEDIUM",
        quiet: referrerStepDue,
      });
    }
  });

  if (referral.times[1] && referral.grandReferrerId && rules.grandLotId && input.grandAllowed && !done("GRAND", null, null)) {
    due.push({ ...base, kind: "GRAND", side: null, step: null, userId: referral.grandReferrerId, actorId: referral.referrerId, lotId: rules.grandLotId, multiplier: 1, big: false });
  }

  for (const m of reachedMilestones(input.installed, rules.milestones)) {
    if (!milestonePays(m) || input.paidMilestones.includes(m.installed)) continue;
    due.push({ kind: "MILESTONE", side: null, step: null, milestone: m, userId: referral.referrerId, actorId: referral.refereeId, lotId: m.lotId, multiplier: 1, big: true, quiet: false });
  }
  return due;
}
