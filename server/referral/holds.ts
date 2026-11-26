import type { Prisma } from "@/generated/prisma/client";
import type { Reason } from "@/lib/anticheat/score";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import { holdReason, referralPairScore, type HoldReason } from "@/lib/referral/hold";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { loadPairInput } from "../anticheat/pair";
import type { Tx } from "../social/lock";

// Contrôles d'un parrainage v2 avant ses versements. Appareil commun (même cookie kiraku.device chez le filleul et son
// parrain, ou chez le filleul et un autre filleul du même parrain), cherché sans plafond. Score de la paire, recalculé
// et gardé sur le parrainage (score, scoredAt). Un motif trouvé met le parrainage « À vérifier », avec ses indices,
// tant que l'équipe n'a pas tranché : rien n'est versé avant sa décision (server/referral/payout-core.ts).

export type HoldEvidence = {
  /** Appareil commun : avec le parrain, ou avec ces autres filleuls du même parrain. */
  device?: { withReferrer: boolean; siblings: string[] };
  /** Score de la paire et ses indices (lib/anticheat/score.ts). */
  score?: { value: number; reasons: Reason[] };
};

/** Autres comptes de la même famille de parrainage qui partagent un appareil avec le filleul. */
export async function sharedDevices(db: Tx, referral: { id: string; referrerId: string; refereeId: string }): Promise<HoldEvidence["device"]> {
  const rows = await db.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT o."userId" FROM "UserSignal" s
    JOIN "UserSignal" o ON o.kind = 'DEVICE' AND o.value = s.value AND o."userId" <> s."userId"
    WHERE s.kind = 'DEVICE' AND s."userId" = ${referral.refereeId}
      AND (o."userId" = ${referral.referrerId}
        OR o."userId" IN (SELECT "refereeId" FROM "Referral" WHERE "referrerId" = ${referral.referrerId} AND id <> ${referral.id}))`;
  const withReferrer = rows.some((r) => r.userId === referral.referrerId);
  const siblings = rows.map((r) => r.userId).filter((id) => id !== referral.referrerId);
  return withReferrer || siblings.length > 0 ? { withReferrer, siblings } : undefined;
}

/** Score de la paire, recalculé maintenant et gardé sur le parrainage. */
export async function rescore(db: Tx, referral: { id: string; referrerId: string; refereeId: string }, sharedCap: number, now: Date, scoring?: DetectionScoring) {
  const input = await loadPairInput(db, referral.referrerId, referral.refereeId, sharedCap, scoring);
  const scored = input ? referralPairScore(input) : { score: 0, reasons: [] };
  await db.referral.update({ where: { id: referral.id }, data: { score: scored.score, scoredAt: now }, select: { id: true } });
  return scored;
}

/**
 * Pose le blocage si un motif est trouvé et que le parrainage n'est ni déjà bloqué ni tranché. `withScore` : recalcule
 * aussi le score (avant une grosse récompense). Renvoie le motif posé, ou null.
 */
export async function applyHold(
  db: Tx,
  referral: { id: string; referrerId: string; refereeId: string },
  rules: Pick<ReferralV2Rules, "holdScore">,
  options: { withScore: boolean; sharedCap: number; now: Date; scoring?: DetectionScoring },
): Promise<HoldReason | null> {
  const device = await sharedDevices(db, referral);
  const scored = options.withScore ? await rescore(db, referral, options.sharedCap, options.now, options.scoring) : null;
  const reason = holdReason({ sharedDevice: device !== undefined, score: scored?.score ?? null }, rules);
  if (!reason) return null;
  const evidence: HoldEvidence = { ...(device && { device }), ...(scored && { score: { value: scored.score, reasons: scored.reasons } }) };
  const held = await db.referral.updateMany({
    where: { id: referral.id, heldAt: null, reviewedAt: null, revokedAt: null },
    data: { heldAt: options.now, holdReason: reason, holdEvidence: evidence as Prisma.InputJsonValue },
  });
  return held.count === 1 ? reason : null;
}
