import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Reason } from "@/lib/anticheat/score";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { periodWindow } from "@/lib/economy/period";
import { referralPairScore } from "@/lib/referral/hold";
import { reachedMilestones } from "@/lib/referral/ladder";
import { lockEnd } from "@/lib/referral/locks";
import type { RewardKind, RewardSide } from "@/lib/referral/payout";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { stepProgress, type StepState, type StepTimes } from "@/lib/referral/steps";
import { refereeTrust, type Trust } from "@/lib/referral/trust";
import { loadPairInput } from "../anticheat/pair";
import { membersById, type MemberInfo } from "../anticheat/queries";
import { prisma } from "../db";
import { lotViews, type LotView } from "../economy/lot-view";
import { sharedDevices } from "./holds";
import { installedCount } from "./payout-core";
import { refereeFactsWith } from "./progress-core";

// Suivi du parrainage v2 pour l'équipe (étape 18, design « tableau » et fiche « deux colonnes » de l'atelier équipe) :
// indicateurs, liste filtrable de tous les parrainages v2, et la fiche d'un parrainage (déroulé, paire, filleul, parrain).
// Lecture seule : les décisions passent par server/actions/admin-referral.ts.

export const TRACKING_FILTERS = ["ALL", "ON_THE_WAY", "INSTALLED", "HOOKED", "LOYAL", "HELD", "REVOKED"] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];
export type TrackingStatus = Exclude<TrackingFilter, "ALL"> | "BANNED";

/** Bloqué sans décision de l'équipe. */
const HELD_OPEN = { heldAt: { not: null }, reviewedAt: null } satisfies Prisma.ReferralWhereInput;

const FILTER_WHERE: Record<Exclude<TrackingFilter, "ALL">, Prisma.ReferralWhereInput> = {
  ON_THE_WAY: { revokedAt: null, step2At: null, NOT: HELD_OPEN },
  INSTALLED: { revokedAt: null, step2At: { not: null }, step3At: null, step4At: null, NOT: HELD_OPEN },
  HOOKED: { revokedAt: null, step3At: { not: null }, step4At: null, NOT: HELD_OPEN },
  LOYAL: { revokedAt: null, step4At: { not: null }, NOT: HELD_OPEN },
  HELD: { revokedAt: null, ...HELD_OPEN },
  REVOKED: { revokedAt: { not: null } },
};

type StatusFields = { revokedAt: Date | null; reviewDecision: string | null; heldAt: Date | null; reviewedAt: Date | null; step2At: Date | null; step3At: Date | null; step4At: Date | null };

/** Statut d'un parrainage, avec le même découpage que les filtres. */
export function trackingStatus(r: StatusFields): TrackingStatus {
  if (r.revokedAt) return r.reviewDecision === "BANNED" ? "BANNED" : "REVOKED";
  if (r.heldAt && !r.reviewedAt) return "HELD";
  if (r.step4At) return "LOYAL";
  if (r.step3At) return "HOOKED";
  return r.step2At ? "INSTALLED" : "ON_THE_WAY";
}

export type TrackingStats = {
  counts: Record<TrackingFilter, number>;
  payoutsToday: number;
  payoutsWeek: number;
  zeni: number;
  boosters: number;
  /** Boosters versés par type (crédits), les plus nombreux d'abord. */
  byType: { name: string; count: number }[];
};

/** Indicateurs du suivi : parrainages par statut, versements du jour et des 7 derniers jours, ce qui a été versé. */
export async function trackingStats(timeZone: string, locale: string, now: Date): Promise<TrackingStats> {
  const dayStart = periodWindow("DAILY", now, timeZone).start;
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const keys = TRACKING_FILTERS.filter((f): f is Exclude<TrackingFilter, "ALL"> => f !== "ALL");
  const [total, perFilter, [totals], types] = await Promise.all([
    prisma.referral.count({ where: { version: 2 } }),
    Promise.all(keys.map((k) => prisma.referral.count({ where: { version: 2, ...FILTER_WHERE[k] } }))),
    prisma.$queryRaw<{ today: bigint; week: bigint; zeni: bigint | null; sealed: bigint | null }[]>`
      SELECT COUNT(*) FILTER (WHERE "createdAt" >= ${dayStart}) AS today,
             COUNT(*) FILTER (WHERE "createdAt" >= ${weekStart}) AS week,
             SUM(COALESCE(("granted"->>'zeni')::bigint, 0)) AS zeni,
             SUM(jsonb_array_length(COALESCE("granted"->'sealedIds', '[]'::jsonb))) AS sealed
      FROM "ReferralReward" WHERE "clawedBackAt" IS NULL`,
    prisma.$queryRaw<{ type: string; n: bigint }[]>`
      SELECT c.key AS type, SUM(c.value::bigint) AS n
      FROM "ReferralReward" r, jsonb_each_text(COALESCE(r."granted"->'credits', '{}'::jsonb)) c
      WHERE r."clawedBackAt" IS NULL
      GROUP BY c.key ORDER BY n DESC`,
  ]);
  const names = await prisma.boosterType.findMany({ where: { id: { in: types.map((t) => t.type) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((b) => [b.id, localize(parseLocalized(b.name), locale)]));
  const counts = { ALL: total, ...Object.fromEntries(keys.map((k, i) => [k, perFilter[i]])) } as Record<TrackingFilter, number>;
  const byType = types.map((t) => ({ name: nameOf.get(t.type) ?? t.type, count: Number(t.n) }));
  return {
    counts,
    payoutsToday: Number(totals?.today ?? 0),
    payoutsWeek: Number(totals?.week ?? 0),
    zeni: Number(totals?.zeni ?? 0),
    boosters: byType.reduce((sum, t) => sum + t.count, 0) + Number(totals?.sealed ?? 0),
    byType,
  };
}

export type LastPayout = { kind: RewardKind; side: RewardSide | null; step: number | null; milestone: number | null; at: string; clawedBack: boolean };
export type TrackingRow = {
  id: string;
  referee: { id: string; name: string };
  referrer: { id: string; name: string };
  status: TrackingStatus;
  knots: StepState[];
  trust: Trust;
  last: LastPayout | null;
};

const MAX_ROWS = 100;

/** Parrainages v2 du filtre, les plus récents d'abord ; `q` cherche un pseudo, un code (standard ou perso) ou un id. */
export async function trackingRows(filter: TrackingFilter, q: string, rules: Pick<ReferralV2Rules, "trustDiscordDays">): Promise<{ rows: TrackingRow[]; more: boolean }> {
  const search = q.trim().slice(0, 40);
  const code = search.replace(/[\s-]/g, "").toUpperCase();
  const where: Prisma.ReferralWhereInput = {
    version: 2,
    ...(filter !== "ALL" && FILTER_WHERE[filter]),
    ...(search && {
      OR: [
        { id: search },
        { referee: { username: { contains: search, mode: "insensitive" } } },
        { referrer: { username: { contains: search, mode: "insensitive" } } },
        { referee: { referralCode: code } },
        { referrer: { referralCode: code } },
        { referee: { vanityCode: code } },
        { referrer: { vanityCode: code } },
      ],
    }),
  };
  const rows = await prisma.referral.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS + 1,
    select: {
      id: true,
      step1At: true,
      step2At: true,
      step3At: true,
      step4At: true,
      heldAt: true,
      reviewedAt: true,
      reviewDecision: true,
      revokedAt: true,
      discordCreatedAt: true,
      referee: { select: { id: true, username: true, discordLinkedAt: true } },
      referrer: { select: { id: true, username: true } },
      rewards: { orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, side: true, step: true, milestone: true, createdAt: true, clawedBackAt: true } },
    },
  });
  return {
    more: rows.length > MAX_ROWS,
    rows: rows.slice(0, MAX_ROWS).map((r) => {
      const held = r.heldAt !== null && r.reviewedAt === null;
      const last = r.rewards[0];
      return {
        id: r.id,
        referee: { id: r.referee.id, name: r.referee.username },
        referrer: { id: r.referrer.id, name: r.referrer.username },
        status: trackingStatus(r),
        knots: [r.step1At, r.step2At, r.step3At, r.step4At].map((at): StepState => (at ? (held ? "HELD" : "DONE") : "LOCKED")),
        trust: refereeTrust({ createdAt: r.discordCreatedAt, linkedAt: r.referee.discordLinkedAt }, rules),
        last: last
          ? { kind: last.kind, side: last.side, step: last.step, milestone: last.milestone, at: last.createdAt.toISOString(), clawedBack: last.clawedBackAt !== null }
          : null,
      };
    }),
  };
}

export type FicheReward = { kind: RewardKind; side: RewardSide | null; step: number | null; milestone: number | null; to: string; lot: LotView | null; multiplier: number; at: string; clawedBack: boolean };
export type FicheStep = { state: StepState; at: string | null; deadline: string | null; have: number; need: number; rewards: FicheReward[] };
export type FicheEvent = { kind: "HOLD" | "MILESTONE" | "GRAND" | "DECISION"; at: string; text: string | null; by: string | null; reward: FicheReward | null; decision: string | null; reason: string | null };
export type ReferralFiche = {
  id: string;
  status: TrackingStatus;
  attachedAt: string;
  ennichiEdition: number | null;
  trust: Trust;
  referee: {
    id: string;
    name: string;
    since: string;
    via: "DISCORD" | "EMAIL" | "NONE";
    discordCreatedAt: string | null;
    banned: boolean;
    openings: number;
    activeDays: number;
    cardLockUntil: string | null;
  };
  referrer: { id: string; name: string; installed: number; milestones: number[]; received: { zeni: number; boosters: number; vouchers: number }; ambassador: boolean; banned: boolean };
  pair: { score: number | null; scoredAt: string | null; live: { score: number; reasons: Reason[] }; sharedDevice: boolean; sharedIp: boolean; holdReason: string | null };
  steps: FicheStep[];
  events: FicheEvent[];
  members: Map<string, MemberInfo>;
};

const asText = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Fiche d'un parrainage v2, ou null s'il n'existe pas (ou est un parrainage v1). */
export async function referralFiche(id: string, rules: ReferralV2Rules, ctx: { timeZone: string; locale: string; now: Date; sharedCap: number }): Promise<ReferralFiche | null> {
  const r = await prisma.referral.findUnique({
    where: { id },
    select: {
      id: true,
      version: true,
      createdAt: true,
      referrerId: true,
      refereeId: true,
      ennichiEdition: true,
      step1At: true,
      step2At: true,
      step3At: true,
      step4At: true,
      heldAt: true,
      holdReason: true,
      reviewedAt: true,
      reviewDecision: true,
      revokedAt: true,
      score: true,
      scoredAt: true,
      discordCreatedAt: true,
      referee: { select: { username: true, registeredAt: true, createdAt: true, email: true, emailVerified: true, discordLinkedAt: true, bannedAt: true, referredAt: true } },
      referrer: { select: { username: true, ambassadorSince: true, bannedAt: true } },
      rewards: { orderBy: { createdAt: "asc" }, select: { kind: true, side: true, step: true, milestone: true, lotId: true, multiplier: true, createdAt: true, clawedBackAt: true, userId: true, user: { select: { username: true } } } },
    },
  });
  if (!r || r.version !== 2) return null;

  const [facts, installed, received, logs, device, pairInput, members] = await Promise.all([
    refereeFactsWith(prisma, r, rules, ctx.timeZone),
    installedCount(prisma, r.referrerId),
    prisma.$queryRaw<{ zeni: bigint | null; credits: bigint | null; sealed: bigint | null; vouchers: bigint | null }[]>`
      SELECT SUM(COALESCE(("granted"->>'zeni')::bigint, 0)) AS zeni,
             SUM((SELECT COALESCE(SUM(value::bigint), 0) FROM jsonb_each_text(COALESCE("granted"->'credits', '{}'::jsonb)))) AS credits,
             SUM(jsonb_array_length(COALESCE("granted"->'sealedIds', '[]'::jsonb))) AS sealed,
             SUM(jsonb_array_length(COALESCE("granted"->'voucherIds', '[]'::jsonb))) AS vouchers
      FROM "ReferralReward" WHERE "userId" = ${r.referrerId} AND "clawedBackAt" IS NULL`,
    prisma.adminLog.findMany({
      where: { targetType: "Referral", targetId: r.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true, after: true, admin: { select: { username: true } } },
    }),
    sharedDevices(prisma, r),
    loadPairInput(prisma, r.referrerId, r.refereeId, ctx.sharedCap),
    membersById([r.referrerId, r.refereeId]),
  ]);
  const lots = await lotViews(r.rewards.flatMap((w) => (w.lotId ? [w.lotId] : [])), ctx.locale);
  const reward = (w: (typeof r.rewards)[number]): FicheReward => ({
    kind: w.kind,
    side: w.side,
    step: w.step,
    milestone: w.milestone,
    to: w.user.username,
    lot: w.lotId ? (lots.get(w.lotId) ?? null) : null,
    multiplier: w.multiplier,
    at: w.createdAt.toISOString(),
    clawedBack: w.clawedBackAt !== null,
  });

  const times: StepTimes = [r.step1At, r.step2At, r.step3At, r.step4At];
  const held = r.heldAt !== null && r.reviewDecision !== "VALIDATED";
  const paid = [1, 2, 3, 4].map((s) => r.rewards.some((w) => w.kind === "STEP" && w.step === s));
  const progress = facts ? stepProgress(facts, times, rules, ctx.timeZone, ctx.now, { held, paid }) : null;
  const steps: FicheStep[] = times.map((at, i) => {
    const p = progress?.[i];
    return {
      state: p?.state ?? (at ? "DONE" : "LOCKED"),
      at: at?.toISOString() ?? null,
      deadline: p?.deadline?.toISOString() ?? null,
      have: p?.have ?? 0,
      need: p?.need ?? 0,
      rewards: r.rewards.filter((w) => (w.kind === "STEP" || w.kind === "TRUST_BONUS") && w.step === i + 1).map(reward),
    };
  });

  const events: FicheEvent[] = [];
  const none = { text: null, by: null, reward: null, decision: null, reason: null };
  if (r.heldAt) events.push({ ...none, kind: "HOLD", at: r.heldAt.toISOString(), text: r.holdReason });
  for (const w of r.rewards.filter((x) => x.kind === "MILESTONE" || x.kind === "GRAND")) {
    events.push({ ...none, kind: w.kind === "GRAND" ? "GRAND" : "MILESTONE", at: w.createdAt.toISOString(), reward: reward(w) });
  }
  for (const l of logs) {
    const after = (l.after && typeof l.after === "object" && !Array.isArray(l.after) ? l.after : {}) as Record<string, unknown>;
    const decision = l.action === "REFERRAL_VALIDATE" ? "VALIDATED" : after.ban === true ? "BANNED" : "REVOKED";
    events.push({ ...none, kind: "DECISION", at: l.createdAt.toISOString(), by: l.admin.username, decision, reason: asText(after.reason) ?? asText(after.note) });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const live = pairInput ? referralPairScore(pairInput) : { score: 0, reasons: [] };
  const sinceDate = r.referee.registeredAt ?? r.referee.createdAt;
  const lockUntil = lockEnd({ referredAt: r.referee.referredAt }, rules.cardLockDays);
  const total = received[0];
  return {
    id: r.id,
    status: trackingStatus(r),
    attachedAt: r.createdAt.toISOString(),
    ennichiEdition: r.ennichiEdition,
    trust: refereeTrust({ createdAt: r.discordCreatedAt, linkedAt: r.referee.discordLinkedAt }, rules),
    referee: {
      id: r.refereeId,
      name: r.referee.username,
      since: sinceDate.toISOString(),
      via: r.referee.discordLinkedAt ? "DISCORD" : r.referee.email && r.referee.emailVerified ? "EMAIL" : "NONE",
      discordCreatedAt: r.discordCreatedAt?.toISOString() ?? null,
      banned: r.referee.bannedAt !== null,
      openings: facts?.installOpenings ?? 0,
      activeDays: facts?.activeDays.length ?? 0,
      cardLockUntil: lockUntil && lockUntil > ctx.now ? lockUntil.toISOString() : null,
    },
    referrer: {
      id: r.referrerId,
      name: r.referrer.username,
      installed,
      milestones: reachedMilestones(installed, rules.milestones).map((m) => m.installed),
      received: { zeni: Number(total?.zeni ?? 0), boosters: Number(total?.credits ?? 0) + Number(total?.sealed ?? 0), vouchers: Number(total?.vouchers ?? 0) },
      ambassador: r.referrer.ambassadorSince !== null,
      banned: r.referrer.bannedAt !== null,
    },
    pair: {
      score: r.score,
      scoredAt: r.scoredAt?.toISOString() ?? null,
      live,
      sharedDevice: device !== undefined,
      sharedIp: live.reasons.some((x) => x.kind === "ip"),
      holdReason: r.holdReason,
    },
    steps,
    events,
    members,
  };
}
