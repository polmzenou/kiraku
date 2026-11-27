import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { DetectionScoring } from "@/lib/anticheat/scoring";
import type { RewardGrant } from "@/lib/referral/clawback";
import { scoreIsFresh } from "@/lib/referral/hold";
import { planPayouts, type DueReward, type PaidReward } from "@/lib/referral/payout";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import type { StepTimes } from "@/lib/referral/steps";
import { refereeTrust } from "@/lib/referral/trust";
import { grantLot, type LotDeps, type LotGrant } from "../economy/lots";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { applyHold } from "./holds";
import { installedReferralWhere } from "./installed";

// Versements du parrainage v2, tous automatiques : étapes des deux côtés, part « confiance » du parrain, paliers,
// grand-parrainage. Rien n'est versé tant que le parrainage est bloqué sans décision ou révoqué ; une validation de
// l'équipe relance payDueRewardsWith, qui verse alors tout ce qui était dû. Une transaction par versement : le
// parrainage puis le bénéficiaire sont verrouillés, la ligne ReferralReward est insérée (son index unique empêche tout
// double versement, même lancé deux fois en parallèle), le lot est versé une fois par multiplicateur, puis le joueur
// est prévenu. Avant une grosse récompense, le score de la paire est recalculé s'il n'est plus récent.

export type PayoutDeps = {
  rules: ReferralV2Rules;
  now: Date;
  /** Au-delà de ce nombre de comptes, une IP ne relie plus (multiAccount.sharedIpCap). */
  sharedCap: number;
  /** Barème du score de la paire (multiAccount.scoring) ; absent : barème d'origine. */
  scoring?: DetectionScoring;
  lotDeps: LotDeps;
  onNotified?: OnNotified;
};

const TX = { maxWait: 10_000, timeout: 30_000 };

type ReferralRow = {
  id: string;
  version: number;
  referrerId: string;
  refereeId: string;
  grandReferrerId: string | null;
  ennichiEdition: number | null;
  /** Multiplicateur des étapes 1 et 2 figé au rattachement pendant l'Ennichi (null hors fête). */
  ennichiMultiplier: number | null;
  step1At: Date | null;
  step2At: Date | null;
  step3At: Date | null;
  step4At: Date | null;
  discordCreatedAt: Date | null;
  heldAt: Date | null;
  reviewDecision: string | null;
  revokedAt: Date | null;
  scoredAt: Date | null;
};

const blocked = (r: Pick<ReferralRow, "heldAt" | "reviewDecision" | "revokedAt">) => r.revokedAt !== null || (r.heldAt !== null && r.reviewDecision !== "VALIDATED");

/** Amis installés d'un parrain (server/referral/installed.ts : v1 qualifiés compris, révoqués et bloqués exclus). */
export async function installedCount(db: Prisma.TransactionClient | PrismaClient, referrerId: string): Promise<number> {
  return db.referral.count({ where: installedReferralWhere(referrerId) });
}

/** Ce que les lots versés ont donné, tel que la reprise le relira. */
function grantedOf(grants: readonly LotGrant[], voucherIds: readonly string[]): RewardGrant {
  const credits: Record<string, number> = {};
  // Les sachets scellés sont comptés à part, un par un (sealedIds)
  for (const g of grants) for (const b of g.boosters) if (!b.sealed) credits[b.boosterTypeId] = (credits[b.boosterTypeId] ?? 0) + b.count;
  return {
    zeni: grants.reduce((sum, g) => sum + g.zeni, 0),
    credits,
    sealedIds: grants.flatMap((g) => g.sealedIds),
    cardIds: grants.flatMap((g) => g.cards.map((c) => c.userCardId)),
    voucherIds: [...voucherIds],
  };
}

/** Verse une récompense due ; false si elle l'était déjà ou si le parrainage ne peut plus rien verser. */
async function payOne(db: PrismaClient, referral: ReferralRow, due: DueReward, deps: PayoutDeps): Promise<boolean> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const [state] = await tx.$queryRaw<Pick<ReferralRow, "heldAt" | "reviewDecision" | "revokedAt">[]>`
        SELECT "heldAt", "reviewDecision"::text AS "reviewDecision", "revokedAt" FROM "Referral" WHERE id = ${referral.id} FOR UPDATE`;
      if (!state || blocked(state)) return false;
      const [user] = await tx.$queryRaw<{ bannedAt: Date | null; ambassadorSince: Date | null }[]>`
        SELECT "bannedAt", "ambassadorSince" FROM "User" WHERE id = ${due.userId} FOR UPDATE`;
      if (!user || user.bannedAt) return false;

      const rewardId = randomUUID();
      const inserted = await tx.$executeRaw`
        INSERT INTO "ReferralReward" (id, "referralId", "userId", kind, side, step, milestone, multiplier, "lotId", granted, "ennichiEdition", "createdAt")
        VALUES (${rewardId}, ${referral.id}, ${due.userId}, ${due.kind}::"ReferralRewardKind", ${due.side}::"ReferralSide", ${due.step}::smallint,
                ${due.milestone?.installed ?? null}::int, ${due.multiplier}::smallint, ${due.lotId}, '{}'::jsonb, ${referral.ennichiEdition}::int, ${deps.now})
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) return false;

      const grants: LotGrant[] = [];
      if (due.lotId) {
        for (let i = 0; i < due.multiplier; i++) {
          grants.push(await grantLot(tx, due.userId, due.lotId, { reason: "REFERRAL", refId: rewardId }, deps.lotDeps, deps.now));
        }
      }
      const voucherIds: string[] = [];
      if (due.milestone) {
        const kinds = [...Array.from({ length: due.milestone.choiceVouchers }, () => "MYTHIC_CHOICE" as const), ...(due.milestone.oneOfOne ? ["ONE_OF_ONE" as const] : [])];
        for (const kind of kinds) {
          const id = randomUUID();
          await tx.voucher.create({ data: { id, userId: due.userId, kind, createdAt: deps.now }, select: { id: true } });
          voucherIds.push(id);
        }
        // Ambassadeur : la proposition attend l'équipe (une seule ouverte par joueur) ; déjà Ambassadeur, rien à proposer
        if (due.milestone.ambassador && !user.ambassadorSince) {
          const installed = await installedCount(tx, due.userId);
          await tx.$executeRaw`
            INSERT INTO "AmbassadorProposal" (id, "userId", installed, "createdAt") VALUES (${randomUUID()}, ${due.userId}, ${installed}::int, ${deps.now})
            ON CONFLICT DO NOTHING`;
        }
      }
      await tx.referralReward.update({
        where: { id: rewardId },
        data: { granted: grantedOf(grants, voucherIds) as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
      if (!due.quiet) {
        await notify(tx, {
          userId: due.userId,
          type: "REFERRAL_REWARD",
          actorId: due.actorId,
          refId: rewardId,
          payload: { kind: due.kind, side: due.side, step: due.step, milestone: due.milestone?.installed ?? null, multiplier: due.multiplier },
          now: deps.now,
        });
      }
      return true;
    },
    TX,
    deps.onNotified,
  );
}

/** Verse tout ce que le parrainage doit et n'a pas encore versé. Renvoie le nombre de versements faits. */
export async function payDueRewardsWith(db: PrismaClient, referralId: string, deps: PayoutDeps): Promise<number> {
  const referral = await db.referral.findUnique({
    where: { id: referralId },
    select: {
      id: true,
      version: true,
      referrerId: true,
      refereeId: true,
      grandReferrerId: true,
      ennichiEdition: true,
      ennichiMultiplier: true,
      step1At: true,
      step2At: true,
      step3At: true,
      step4At: true,
      discordCreatedAt: true,
      heldAt: true,
      reviewDecision: true,
      revokedAt: true,
      scoredAt: true,
    },
  });
  if (!referral || referral.version !== 2 || blocked(referral)) return 0;

  const [referee, paid, paidMilestones, installed, grand] = await Promise.all([
    db.user.findUnique({ where: { id: referral.refereeId }, select: { discordLinkedAt: true } }),
    db.referralReward.findMany({ where: { referralId: referral.id }, select: { kind: true, side: true, step: true, milestone: true } }),
    db.referralReward.findMany({ where: { userId: referral.referrerId, kind: "MILESTONE", clawedBackAt: null }, select: { milestone: true } }),
    installedCount(db, referral.referrerId),
    // Lien grand-parrain → parrain encore valable : la v1 révoque par son statut, sans revokedAt (installed.ts)
    referral.grandReferrerId
      ? db.referral.findFirst({
          where: { referrerId: referral.grandReferrerId, refereeId: referral.referrerId, revokedAt: null, status: { not: "REVOKED" } },
          select: { referrer: { select: { bannedAt: true } } },
        })
      : null,
  ]);

  const times: StepTimes = [referral.step1At, referral.step2At, referral.step3At, referral.step4At];
  const due = planPayouts(
    {
      referral: {
        referrerId: referral.referrerId,
        refereeId: referral.refereeId,
        grandReferrerId: referral.grandReferrerId,
        ennichiMultiplier: referral.ennichiMultiplier,
        times,
        trust: refereeTrust({ createdAt: referral.discordCreatedAt, linkedAt: referee?.discordLinkedAt ?? null }, deps.rules),
      },
      paid: paid as PaidReward[],
      paidMilestones: paidMilestones.map((m) => m.milestone).filter((m): m is number => m !== null),
      installed,
      grandAllowed: grand !== null && !grand.referrer.bannedAt,
    },
    deps.rules,
  );
  if (due.length === 0) return 0;

  // Grosse récompense : score de la paire recalculé s'il n'est plus récent ; au-dessus du seuil, tout attend l'équipe
  if (due.some((d) => d.big) && !scoreIsFresh(referral.scoredAt, deps.now, deps.rules)) {
    const held = await db.$transaction((tx) => applyHold(tx, referral, deps.rules, { withScore: true, sharedCap: deps.sharedCap, scoring: deps.scoring, now: deps.now }), TX);
    if (held) return 0;
  }

  let count = 0;
  for (const d of due) if (await payOne(db, referral, d, deps)) count++;
  return count;
}
