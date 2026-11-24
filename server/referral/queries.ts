import "server-only";
import { mergeLots } from "@/lib/economy/lot-merge";
import { milestonePays, nextMilestone, reachedMilestones } from "@/lib/referral/ladder";
import type { RewardKind, RewardSide } from "@/lib/referral/payout";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { stepProgress, type StepState, type StepTimes } from "@/lib/referral/steps";
import { refereeTrust, trustPartDue, type Trust } from "@/lib/referral/trust";
import { lockEnd } from "@/lib/referral/locks";
import type { VoucherGroup } from "@/lib/referral/vouchers";
import { prisma } from "../db";
import { lotViews, type LotLine, type LotView } from "../economy/lot-view";
import { getSetting } from "../settings";
import { installedCount } from "./payout-core";
import { refereeFactsWith } from "./progress-core";
import { voucherGroupsOf } from "./vouchers";

// Lectures de la page /parrainage v2 (étape 18) : ce que rapporte chaque étape des deux côtés, l'échelle des paliers,
// les filleuls du joueur et leur avancement, sa propre vue de filleul, le dernier cadeau reçu. Rien n'est écrit ici :
// la visite fait avancer les parrainages avant la lecture (app/[locale]/parrainage/page.tsx).

/** Lots d'une étape ; `referrerTotal` : ce que reçoit le parrain d'un ami de confiance (son lot et la part « confiance »). */
export type StepGifts = { step: number; referee: LotView | null; referrer: LotView | null; trust: LotView | null; referrerTotal: LotView | null };
export type RungView = {
  installed: number;
  lot: LotView | null;
  choiceVouchers: number;
  oneOfOne: boolean;
  ambassador: boolean;
  legend: boolean;
  state: "DONE" | "NEXT" | "LOCKED";
};
/** `readyAt` (étape 2) et `deadline` (étapes 3 et 4) ne sont donnés que s'ils sont encore à venir. */
export type StepRow = { state: StepState; at: string | null; have: number; need: number; readyAt: string | null; deadline: string | null };
export type RefereeStatus = "ON_THE_WAY" | "INSTALLED" | "DONE" | "HELD" | "REVOKED" | "BANNED";
export type RefereeRowView = {
  id: string;
  name: string;
  image: string | null;
  status: RefereeStatus;
  steps: StepRow[];
  done: number;
  /** Prochaine étape et ce qu'elle rapporte au parrain ; null si plus rien n'est à venir. */
  next: (StepRow & { step: number }) | null;
  nextLot: LotView | null;
  /** Confiance moyenne : la part « confiance » de la prochaine étape, qui n'arrivera qu'à l'étape 3. */
  trustLater: LotView | null;
};
export type SelfView = {
  referrer: { name: string; image: string | null };
  status: "ACTIVE" | "HELD" | "REVOKED";
  steps: StepRow[];
  cardLockUntil: string | null;
};
export type LastReward = {
  kind: RewardKind;
  side: RewardSide | null;
  step: number | null;
  milestone: number | null;
  /** L'autre joueur : le filleul pour le parrain, le parrain pour le filleul, le filleul du filleul pour le grand-parrain. */
  actor: string | null;
  lot: LotView | null;
  at: string;
};
export type ReferralV2View = {
  code: string;
  steps: StepGifts[];
  ladder: RungView[];
  installed: number;
  self: SelfView | null;
  referees: RefereeRowView[];
  totals: { installed: number; onTheWay: number; held: number };
  lastReward: LastReward | null;
  /** Sans parrain et encore dans les jours de saisie : il peut entrer le code d'un ami. */
  canAttach: boolean;
  /** Bons à utiliser (bandeau qui mène au choix de la carte). */
  vouchers: VoucherGroup[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const MAX_ROWS = 50;
const DAY = 86_400_000;

const lineKey = (l: LotLine) => (l.kind === "BOOSTER" ? `B:${l.look.slug}` : l.kind === "CARD" ? `C:${l.card?.cardId ?? l.name}` : `R:${l.rarity}`);
const merge = (lots: readonly (LotView | null)[]) => mergeLots<LotLine, LotView>(lots, lineKey);

function rowsOf(progress: ReturnType<typeof stepProgress>, now: Date): StepRow[] {
  const ahead = (d: Date | null) => (d && d.getTime() > now.getTime() ? d.toISOString() : null);
  return progress.map((p) => ({ state: p.state, at: iso(p.at), have: p.have, need: p.need, readyAt: ahead(p.readyAt), deadline: ahead(p.deadline) }));
}

function statusOf(r: { revokedAt: Date | null; reviewDecision: string | null; heldAt: Date | null; step2At: Date | null; step4At: Date | null }): RefereeStatus {
  if (r.revokedAt) return r.reviewDecision === "BANNED" ? "BANNED" : "REVOKED";
  if (r.heldAt && r.reviewDecision !== "VALIDATED") return "HELD";
  if (r.step4At) return "DONE";
  return r.step2At ? "INSTALLED" : "ON_THE_WAY";
}

/**
 * Ce que la prochaine étape `step` d'un filleul versera au parrain : le lot de l'étape, et les parts « confiance » qui
 * tombent avec elle (la sienne si la confiance est haute ; à l'étape 3, celles des étapes 1 et 2 qui l'attendaient).
 * `later` : sa part « confiance » quand elle attendra l'étape 3.
 */
function nextGain(step: number, times: StepTimes, trust: Trust, rules: ReferralV2Rules, lot: (id: string | null) => LotView | null, now: Date) {
  const after = times.map((at, i) => (i === step - 1 ? now : at)) as unknown as StepTimes;
  const parts = [lot(rules.stepLots[step - 1].referrer)];
  for (const k of [1, 2] as const) {
    const trustLot = rules.stepLots[k - 1].referrerTrust;
    if (trustLot && trustPartDue(k, after, trust) && !trustPartDue(k, times, trust)) parts.push(lot(trustLot));
  }
  const own = step <= 2 ? rules.stepLots[step - 1].referrerTrust : null;
  const later = own && !trustPartDue(step as 1 | 2, after, trust) ? lot(own) : null;
  return { now: merge(parts), later };
}

/** Étapes et lots des deux côtés, pour les cartes « ce que vous gagnez » et l'échelle (aussi pour un invité). */
export async function referralGifts(rules: ReferralV2Rules, locale: string, installed: number) {
  const ids = [
    ...rules.stepLots.flatMap((s) => [s.referee, s.referrer, s.referrerTrust]),
    ...rules.milestones.map((m) => m.lotId),
  ].filter((id): id is string => id !== null);
  const lots = await lotViews(ids, locale);
  const lot = (id: string | null) => (id ? (lots.get(id) ?? null) : null);
  const steps: StepGifts[] = rules.stepLots.map((s, i) => ({
    step: i + 1,
    referee: lot(s.referee),
    referrer: lot(s.referrer),
    trust: lot(s.referrerTrust),
    referrerTotal: merge([lot(s.referrer), lot(s.referrerTrust)]),
  }));
  const next = nextMilestone(installed, rules.milestones);
  const reached = new Set(reachedMilestones(installed, rules.milestones).map((m) => m.installed));
  const ladder: RungView[] = rules.milestones.map((m) => ({
    installed: m.installed,
    lot: lot(m.lotId),
    choiceVouchers: m.choiceVouchers,
    oneOfOne: m.oneOfOne,
    ambassador: m.ambassador,
    legend: m.legend,
    state: reached.has(m.installed) ? "DONE" : next?.installed === m.installed ? "NEXT" : "LOCKED",
  }));
  return { steps, ladder, lot };
}

export async function referralPageV2(
  userId: string,
  rules: ReferralV2Rules,
  ctx: { timeZone: string; locale: string; now: Date; attachWindowDays: number },
): Promise<ReferralV2View> {
  const { timeZone, locale, now } = ctx;
  const [me, installed, own, mine, last, vouchers] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true, vanityCode: true, registeredAt: true, createdAt: true } }),
    installedCount(prisma, userId),
    prisma.referral.findUnique({
      where: { refereeId: userId },
      select: {
        id: true,
        version: true,
        createdAt: true,
        refereeId: true,
        step1At: true,
        step2At: true,
        step3At: true,
        step4At: true,
        heldAt: true,
        reviewDecision: true,
        revokedAt: true,
        referrer: { select: { username: true, image: true } },
        referee: { select: { referredAt: true } },
      },
    }),
    prisma.referral.findMany({
      where: { referrerId: userId, version: 2 },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        createdAt: true,
        refereeId: true,
        step1At: true,
        step2At: true,
        step3At: true,
        step4At: true,
        heldAt: true,
        reviewDecision: true,
        revokedAt: true,
        discordCreatedAt: true,
        referee: { select: { username: true, image: true, discordLinkedAt: true } },
        rewards: { where: { side: "REFERRER", kind: "STEP" }, select: { step: true } },
      },
    }),
    prisma.referralReward.findFirst({
      where: { userId, clawedBackAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        kind: true,
        side: true,
        step: true,
        milestone: true,
        lotId: true,
        createdAt: true,
        referral: { select: { referrerId: true, referee: { select: { username: true } }, referrer: { select: { username: true } } } },
      },
    }),
    voucherGroupsOf(userId),
  ]);
  const { steps, ladder, lot } = await referralGifts(rules, locale, installed);
  const times = (r: { step1At: Date | null; step2At: Date | null; step3At: Date | null; step4At: Date | null }): StepTimes => [r.step1At, r.step2At, r.step3At, r.step4At];

  // Vue du filleul (parrainage v2 seulement)
  let self: SelfView | null = null;
  if (own && own.version === 2) {
    const facts = await refereeFactsWith(prisma, own, rules, timeZone);
    const paid = await prisma.referralReward.findMany({ where: { referralId: own.id, side: "REFEREE", kind: "STEP" }, select: { step: true } });
    const held = own.heldAt !== null && own.reviewDecision !== "VALIDATED";
    const lockUntil = lockEnd({ referredAt: own.referee.referredAt }, rules.cardLockDays);
    self = {
      referrer: { name: own.referrer.username, image: own.referrer.image },
      status: own.revokedAt ? "REVOKED" : held ? "HELD" : "ACTIVE",
      steps: facts
        ? rowsOf(stepProgress(facts, times(own), rules, timeZone, now, { held, paid: [1, 2, 3, 4].map((s) => paid.some((p) => p.step === s)) }), now)
        : [],
      cardLockUntil: lockUntil && lockUntil > now ? lockUntil.toISOString() : null,
    };
  }

  // Filleuls : avancement de ceux qui sont encore en route, ce que leur prochaine étape rapporte au parrain
  const referees: RefereeRowView[] = [];
  for (const r of mine) {
    const status = statusOf(r);
    const held = status === "HELD";
    const paid = [1, 2, 3, 4].map((s) => r.rewards.some((w) => w.step === s));
    const facts = status === "REVOKED" || status === "BANNED" || status === "DONE" ? null : await refereeFactsWith(prisma, r, rules, timeZone);
    const progress = facts ? stepProgress(facts, times(r), rules, timeZone, now, { held, paid }) : null;
    const rows = progress
      ? rowsOf(progress, now)
      : times(r).map((at) => ({ state: (at ? "DONE" : "LOCKED") as StepState, at: iso(at), have: 0, need: 0, readyAt: null, deadline: null }));
    const nextIndex = rows.findIndex((s) => s.state === "NEXT" || (held && s.state === "HELD" && !s.at));
    const next = nextIndex >= 0 ? { ...rows[nextIndex], step: nextIndex + 1 } : null;
    const trust = refereeTrust({ createdAt: r.discordCreatedAt, linkedAt: r.referee.discordLinkedAt }, rules);
    const gain = next ? nextGain(next.step, times(r), trust, rules, lot, now) : null;
    referees.push({
      id: r.id,
      name: r.referee.username,
      image: r.referee.image,
      status,
      steps: rows,
      done: times(r).filter(Boolean).length,
      next,
      nextLot: gain?.now ?? null,
      trustLater: gain?.later ?? null,
    });
  }
  const totals = {
    installed,
    onTheWay: referees.filter((r) => r.status === "ON_THE_WAY").length,
    held: referees.filter((r) => r.status === "HELD").length,
  };

  let lastReward: LastReward | null = null;
  if (last) {
    const r = last.referral;
    const actor = !r ? null : r.referrerId === userId ? r.referee.username : r.referrer.username;
    const lastLot = last.lotId ? (lot(last.lotId) ?? (await lotViews([last.lotId], locale)).get(last.lotId) ?? null) : null;
    lastReward = { kind: last.kind, side: last.side, step: last.step, milestone: last.milestone, actor, lot: lastLot, at: last.createdAt.toISOString() };
  }

  const since = me.registeredAt ?? me.createdAt;
  const canAttach = !own && now.getTime() - since.getTime() <= ctx.attachWindowDays * DAY;

  return { code: me.vanityCode ?? me.referralCode, steps, ladder, installed, self, referees, totals, lastReward, canAttach, vouchers };
}

export type LegacyClaim = { referralId: string; name: string; lot: LotView | null };

/**
 * Lots de l'ancien parrainage (v1) que le joueur n'a pas réclamés : ils le restent après le passage à la v2, chacun par
 * son bouton (claimReferralAction ne verse qu'un parrainage v1 qualifié, une fois par côté).
 */
export async function legacyReferralClaims(userId: string, locale: string): Promise<LegacyClaim[]> {
  const [referrerLotId, refereeLotId] = await Promise.all([getSetting("referral.referrerLotId"), getSetting("referral.refereeLotId")]);
  const sides = [
    ...(referrerLotId ? [{ referrerId: userId, referrerClaimedAt: null }] : []),
    ...(refereeLotId ? [{ refereeId: userId, refereeClaimedAt: null }] : []),
  ];
  if (sides.length === 0) return [];
  const rows = await prisma.referral.findMany({
    where: { version: 1, status: "QUALIFIED", OR: sides },
    orderBy: { qualifiedAt: "asc" },
    take: MAX_ROWS,
    select: { id: true, referrerId: true, referrer: { select: { username: true } }, referee: { select: { username: true } } },
  });
  const lots = await lotViews([referrerLotId, refereeLotId].filter((id): id is string => id !== null), locale);
  return rows.map((r) => {
    const asReferrer = r.referrerId === userId;
    const lotId = asReferrer ? referrerLotId : refereeLotId;
    return { referralId: r.id, name: asReferrer ? r.referee.username : r.referrer.username, lot: lotId ? (lots.get(lotId) ?? null) : null };
  });
}

/** Un palier verse-t-il quelque chose ? (badges et cadre seuls : conditions de profil) */
export const rungPays = (r: RungView) => milestonePays({ installed: r.installed, lotId: r.lot?.id ?? null, choiceVouchers: r.choiceVouchers, oneOfOne: r.oneOfOne, ambassador: r.ambassador, legend: r.legend });
