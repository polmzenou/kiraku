import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Reason } from "@/lib/anticheat/score";
import { mergeLots, scaleLot } from "@/lib/economy/lot-merge";
import { planPayouts } from "@/lib/referral/payout";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import type { StepTimes } from "@/lib/referral/steps";
import { refereeTrust } from "@/lib/referral/trust";
import { membersById, type MemberInfo } from "../anticheat/queries";
import { prisma } from "../db";
import { lotViews, type LotLine, type LotView } from "../economy/lot-view";
import { installedCount } from "./payout-core";

// Lectures de l'admin du parrainage v2 (étape 18) : la file « À vérifier » (design « cartes » de l'atelier équipe), les
// Ambassadeurs proposés et leur compteur dans le menu. Rien n'est écrit ici : les décisions passent par
// server/actions/admin-referral.ts.

/** Parrainages bloqués sans décision : la file « À vérifier ». */
const QUEUE_WHERE = { version: 2, heldAt: { not: null }, reviewedAt: null, revokedAt: null } satisfies Prisma.ReferralWhereInput;

/** Propositions d'Ambassadeur pas encore tranchées. */
const PROPOSAL_WHERE = { decidedAt: null } satisfies Prisma.AmbassadorProposalWhereInput;

/** Ce qui attend l'équipe dans la file : parrainages « À vérifier » et Ambassadeurs proposés (compteur du menu). */
export async function heldReferralCount(): Promise<number> {
  const [held, proposals] = await Promise.all([prisma.referral.count({ where: QUEUE_WHERE }), prisma.ambassadorProposal.count({ where: PROPOSAL_WHERE })]);
  return held + proposals;
}

export type VanityRow = {
  userId: string;
  name: string;
  code: string;
  /** Le code standard du joueur, qui marche toujours. */
  standard: string;
  ambassador: boolean;
  /** Dernière pose dans le journal de l'équipe (absente pour un code posé autrement). */
  setAt: string | null;
  setBy: string | null;
};

/** Codes perso posés, par pseudo. */
export async function vanityCodes(take = 500): Promise<VanityRow[]> {
  const users = await prisma.user.findMany({
    where: { vanityCode: { not: null } },
    orderBy: { username: "asc" },
    take,
    select: { id: true, username: true, vanityCode: true, referralCode: true, ambassadorSince: true },
  });
  const logs = users.length
    ? await prisma.adminLog.findMany({
        where: { action: "REFERRAL_VANITY_SET", targetType: "User", targetId: { in: users.map((u) => u.id) } },
        orderBy: { createdAt: "desc" },
        select: { targetId: true, createdAt: true, admin: { select: { username: true } } },
      })
    : [];
  const last = new Map<string, (typeof logs)[number]>();
  for (const l of logs) if (l.targetId && !last.has(l.targetId)) last.set(l.targetId, l);
  return users.flatMap((u) => {
    if (!u.vanityCode) return [];
    const log = last.get(u.id);
    return [{ userId: u.id, name: u.username, code: u.vanityCode, standard: u.referralCode, ambassador: u.ambassadorSince !== null, setAt: log ? log.createdAt.toISOString() : null, setBy: log?.admin.username ?? null }];
  });
}

export type ProposalItem = {
  id: string;
  user: { id: string; name: string; banned: boolean; ambassador: boolean };
  /** Amis installés quand la proposition s'est créée, et maintenant. */
  installed: { then: number; now: number };
  createdAt: string;
};

/** Ambassadeurs proposés par le parrainage, du plus ancien au plus récent. */
export async function ambassadorProposals(take = 50): Promise<ProposalItem[]> {
  const rows = await prisma.ambassadorProposal.findMany({
    where: PROPOSAL_WHERE,
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, installed: true, createdAt: true, user: { select: { id: true, username: true, bannedAt: true, ambassadorSince: true } } },
  });
  const now = await Promise.all(rows.map((r) => installedCount(prisma, r.user.id)));
  return rows.map((r, i) => ({
    id: r.id,
    user: { id: r.user.id, name: r.user.username, banned: r.user.bannedAt !== null, ambassador: r.user.ambassadorSince !== null },
    installed: { then: r.installed, now: now[i] },
    createdAt: r.createdAt.toISOString(),
  }));
}

export type QueueItem = {
  id: string;
  referee: { id: string; name: string };
  referrer: { id: string; name: string };
  holdReason: "DEVICE" | "SCORE";
  heldAt: string;
  score: number | null;
  scoredAt: string | null;
  /** Appareil commun : avec le parrain, et les pseudos des autres filleuls du même parrain sur cet appareil. */
  device: { withReferrer: boolean; siblings: string[] } | null;
  /** Indices du score de la paire, au moment du blocage. */
  reasons: Reason[];
  stepsDone: number;
  /** Ce qui attend la décision, de chaque côté : étapes atteintes et parts « confiance » dues, pas encore versées. */
  pending: { referee: LotView | null; referrer: LotView | null };
};

type Evidence = { device?: { withReferrer?: unknown; siblings?: unknown }; score?: { reasons?: unknown } };

const lineKey = (l: LotLine) => (l.kind === "BOOSTER" ? `B:${l.look.slug}` : l.kind === "CARD" ? `C:${l.card?.cardId ?? l.name}` : `R:${l.rarity}`);

/** File « À vérifier », du plus ancien blocage au plus récent, avec la fiche courte des comptes cités. */
export async function referralQueue(rules: ReferralV2Rules, locale: string, take = 50): Promise<{ items: QueueItem[]; members: Map<string, MemberInfo> }> {
  const rows = await prisma.referral.findMany({
    where: QUEUE_WHERE,
    orderBy: { heldAt: "asc" },
    take,
    select: {
      id: true,
      referrerId: true,
      refereeId: true,
      grandReferrerId: true,
      // ×2 de l'Ennichi sur les étapes 1 et 2 d'un ami arrivé pendant la fête, figé à son rattachement
      ennichiMultiplier: true,
      holdReason: true,
      heldAt: true,
      holdEvidence: true,
      score: true,
      scoredAt: true,
      step1At: true,
      step2At: true,
      step3At: true,
      step4At: true,
      discordCreatedAt: true,
      referee: { select: { username: true, discordLinkedAt: true } },
      referrer: { select: { username: true } },
      rewards: { select: { kind: true, side: true, step: true, milestone: true } },
    },
  });

  const parsed = rows.map((r) => {
    const ev = (r.holdEvidence && typeof r.holdEvidence === "object" && !Array.isArray(r.holdEvidence) ? r.holdEvidence : {}) as Evidence;
    const siblings = Array.isArray(ev.device?.siblings) ? ev.device.siblings.filter((s): s is string => typeof s === "string") : [];
    const reasons = Array.isArray(ev.score?.reasons) ? (ev.score.reasons as Reason[]) : [];
    const times: StepTimes = [r.step1At, r.step2At, r.step3At, r.step4At];
    // Ce que la validation verserait pour ce parrainage (paliers et grand-parrainage à part)
    const due = planPayouts(
      {
        referral: {
          referrerId: r.referrerId,
          refereeId: r.refereeId,
          grandReferrerId: null,
          ennichiMultiplier: r.ennichiMultiplier,
          times,
          trust: refereeTrust({ createdAt: r.discordCreatedAt, linkedAt: r.referee.discordLinkedAt }, rules),
        },
        paid: r.rewards,
        paidMilestones: [],
        installed: 0,
        grandAllowed: false,
      },
      rules,
    ).filter((d) => d.kind === "STEP" || d.kind === "TRUST_BONUS");
    return { r, siblings, reasons, times, due, device: ev.device ? { withReferrer: ev.device.withReferrer === true, siblings } : null };
  });

  const lotIds = parsed.flatMap((p) => p.due.flatMap((d) => (d.lotId ? [d.lotId] : [])));
  const memberIds = [...new Set(parsed.flatMap((p) => [p.r.referrerId, p.r.refereeId, ...p.siblings]))];
  const [lots, members] = await Promise.all([lotViews(lotIds, locale), membersById(memberIds)]);
  // Chaque lot compté autant de fois qu'il sera versé (×2 de l'Ennichi figé sur les étapes 1 et 2)
  const side = (due: typeof parsed[number]["due"], s: "REFEREE" | "REFERRER") =>
    mergeLots<LotLine, LotView>(
      due.filter((d) => d.side === s && d.lotId).map((d) => scaleLot<LotLine, LotView>(lots.get(d.lotId!) ?? null, d.multiplier)),
      lineKey,
    );

  const items = parsed.map(({ r, siblings, reasons, times, due, device }): QueueItem => ({
    id: r.id,
    referee: { id: r.refereeId, name: r.referee.username },
    referrer: { id: r.referrerId, name: r.referrer.username },
    holdReason: r.holdReason ?? "SCORE",
    heldAt: (r.heldAt ?? new Date(0)).toISOString(),
    score: r.score,
    scoredAt: r.scoredAt?.toISOString() ?? null,
    device: device && { withReferrer: device.withReferrer, siblings: siblings.map((id) => members.get(id)?.username ?? id) },
    reasons,
    stepsDone: times.filter(Boolean).length,
    pending: { referee: side(due, "REFEREE"), referrer: side(due, "REFERRER") },
  }));
  return { items, members };
}
